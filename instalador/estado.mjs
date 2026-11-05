import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const versaoKit = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const hashConteudo = (conteudo) => createHash('sha256').update(conteudo).digest('hex');
export const caminhoEstado = (home = os.homedir()) => path.join(home, '.vibecoding-devtools', 'estado.json');

export function lerEstado({ home = os.homedir() } = {}) {
  try {
    const estado = JSON.parse(fs.readFileSync(caminhoEstado(home), 'utf8'));
    if (!estado || !Array.isArray(estado.itens) || typeof estado.versao !== 'string') {
      throw new Error('Estado do instalador inválido');
    }
    return estado;
  } catch (erro) {
    if (erro.code === 'ENOENT') return { versao: versaoKit, data: null, itens: [] };
    throw erro; // Estado corrompido nunca vira uma instalação vazia.
  }
}

export function escreverAtomico(destino, conteudo) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporario = `${destino}.${randomUUID()}.tmp`;
  let fd;
  try {
    let modo = 0o600;
    try { modo = fs.statSync(destino).mode & 0o777; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    fd = fs.openSync(temporario, 'wx', modo);
    fs.writeFileSync(fd, conteudo);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporario, destino);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporario, { force: true });
  }
}

export function gravarEstado(estado, { home = os.homedir() } = {}) {
  const conteudo = JSON.stringify({ ...estado, versao: versaoKit, data: new Date().toISOString() }, null, 2) + '\n';
  escreverAtomico(caminhoEstado(home), conteudo);
}

export const caminhoTrava = (home) => path.join(home, '.vibecoding-devtools', 'instalador.lock');

// A trava cobre toda a transação de leitura/efeitos/gravação, não apenas o rename do JSON.
// PID vivo nunca expira por tempo; arquivo incompleto só pode ser recuperado depois de 30 segundos.
export function comTrava(home, trabalho, { dryRun = false } = {}) {
  if (dryRun) return trabalho(); // dry-run não cria nem remove arquivos.
  const arquivo = caminhoTrava(home);
  for (let p = path.dirname(arquivo); ; p = path.dirname(p)) {
    try { if (fs.lstatSync(p).isSymbolicLink()) throw new Error(`Link na pasta do estado: ${p}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (p === path.dirname(p)) break;
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const token = randomUUID();
  let fd;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      fd = fs.openSync(arquivo, 'wx', 0o600);
      break;
    } catch (erro) {
      if (erro.code !== 'EEXIST') throw erro;
      const st = fs.lstatSync(arquivo);
      if (!st.isFile() || st.isSymbolicLink()) throw new Error('Trava inválida do instalador');
      const texto = fs.readFileSync(arquivo, 'utf8');
      let velha = false;
      try {
        const lock = JSON.parse(texto);
        if (!Number.isInteger(lock.pid) || lock.pid <= 0 || typeof lock.token !== 'string') throw new Error();
        try { process.kill(lock.pid, 0); }
        catch (e) { if (e.code === 'ESRCH') velha = true; }
      } catch {
        velha = Date.now() - st.mtimeMs > 30000;
      }
      if (!velha) throw new Error('Outra instalação está em andamento (trava ativa)');
      if (fs.readFileSync(arquivo, 'utf8') !== texto) continue;
      fs.unlinkSync(arquivo);
    }
  }
  if (fd === undefined) throw new Error('Não foi possível obter a trava do instalador');
  const adquirida = fs.fstatSync(fd);
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
    fs.fsyncSync(fd);
    return trabalho();
  } finally {
    fs.closeSync(fd);
    // Nunca liberar uma trava que passou a pertencer a outro processo.
    try {
      const atual = fs.lstatSync(arquivo);
      if (atual.dev === adquirida.dev && atual.ino === adquirida.ino) {
        let minha = true;
        try { minha = JSON.parse(fs.readFileSync(arquivo, 'utf8')).token === token; }
        catch (e) { if (!(e instanceof SyntaxError)) throw e; } // escrita inicial da própria trava falhou.
        if (minha) fs.unlinkSync(arquivo);
      }
    }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
