import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isUtf8 } from 'node:buffer';
import { lerEstado, gravarEstado, hashConteudo, escreverAtomico, comTrava } from './estado.mjs';

export const INICIO = '<!-- vibecoding-devtools:inicio -->';
export const FIM = '<!-- vibecoding-devtools:fim -->';
const relatorio = (dryRun) => ({ ok: true, dryRun, acoes: [], conflitos: [], avisos: [], erros: [] });
const existe = (p) => {
  try { return fs.lstatSync(p); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};
const marcador = (item) => item.tipo === 'bloco' ? item.marcador ?? INICIO : null;
const identidade = (item) => item.tipo === 'comando'
  ? JSON.stringify([item.tipo, item.cmd, item.args, item.cwd, item.cli, item.dono])
  : JSON.stringify([item.tipo, path.resolve(item.destino), marcador(item)]);
const confirmado = ({ pendente, operacao, anterior, hashAntes, hashDisco, ...item }) => item;

function conferirCaminho(destino) {
  for (let p = path.resolve(destino); ; p = path.dirname(p)) {
    if (existe(p)?.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${p}`);
    if (p === path.dirname(p)) break;
  }
}

function utf8(bytes) {
  if (!isUtf8(bytes) || bytes.subarray(0, 2).equals(Buffer.from([255, 254]))
    || bytes.subarray(0, 2).equals(Buffer.from([254, 255]))) return null;
  return bytes.toString('utf8');
}

function trecho(texto) {
  const inicio = texto.indexOf(INICIO);
  const fim = texto.indexOf(FIM);
  if (inicio < 0 && fim < 0) return null;
  if (inicio < 0 || fim < inicio || texto.indexOf(INICIO, inicio + INICIO.length) >= 0
    || texto.indexOf(FIM, fim + FIM.length) >= 0) throw new Error('Marcadores de bloco inválidos ou duplicados');
  return { inicio, fim: fim + FIM.length, conteudo: texto.slice(inicio, fim + FIM.length) };
}

function semBloco(texto, bloco, item) {
  let inicio = bloco.inicio;
  if (item.separador && texto.slice(inicio - item.separador.length, inicio) === item.separador) {
    inicio -= item.separador.length;
  }
  return texto.slice(0, inicio) + texto.slice(bloco.fim);
}

// Retira apenas bloco conhecido e intacto, para validar a propriedade do arquivo que o contém.
function baseDoArquivo(atual, destino, itens) {
  const registro = itens.find((i) => i.tipo === 'bloco' && i.destino === destino);
  if (!registro) return { bytes: atual, sufixo: '' };
  const texto = utf8(atual);
  if (texto === null) throw new Error('Arquivo de bloco não é UTF-8 válido');
  const bloco = trecho(texto);
  if (!bloco) return { bytes: atual, sufixo: '' };
  if (registro.pendente || hashConteudo(bloco.conteudo) !== registro.hash) {
    throw new Error('Bloco alterado ou pendente; arquivo mantido');
  }
  return { bytes: Buffer.from(semBloco(texto, bloco, registro)), sufixo: (registro.separador ?? '') + bloco.conteudo };
}

function resolverComando(cmd, opcoes) {
  const win = process.platform === 'win32';
  const valorEnv = (nome) => Object.entries(opcoes.env).find(([k]) => k.toUpperCase() === nome)?.[1];
  const extensoes = win && !path.extname(cmd)
    ? (valorEnv('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  const pastas = /[\\/]/.test(cmd) || path.isAbsolute(cmd) ? ['']
    : (valorEnv('PATH') ?? '').split(path.delimiter).filter(Boolean).map((p) => p.replace(/^"(.*)"$/, '$1'));
  for (const pasta of pastas) for (const ext of extensoes) {
    const arquivo = path.resolve(opcoes.cwd, pasta, cmd + ext);
    try {
      if (!fs.statSync(arquivo).isFile()) continue;
      if (!win) fs.accessSync(arquivo, fs.constants.X_OK);
      return arquivo;
    } catch { /* procura a próxima extensão/pasta */ }
  }
  throw new Error(`Comando não encontrado no PATH: ${cmd}`);
}

function comando(acao, home) {
  if (typeof acao.cmd !== 'string' || !acao.cmd || !Array.isArray(acao.args)
    || acao.args.some((a) => typeof a !== 'string')) throw new Error('Comando exige cmd e args em lista de strings');
  const env = { ...process.env };
  for (const [chave, valor] of Object.entries({ HOME: home, USERPROFILE: home, ...acao.env })) {
    if (process.platform === 'win32') for (const existente of Object.keys(env)) {
      if (existente.toUpperCase() === chave.toUpperCase()) delete env[existente];
    }
    env[chave] = valor;
  }
  const opcoes = { cwd: acao.cwd ?? home, env, encoding: 'utf8', shell: false, windowsHide: true };
  let cmd = resolverComando(acao.cmd, opcoes);
  let args = acao.args;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)) {
    if ([cmd, ...args].some((a) => /["%!\r\n\0]/.test(a))) throw new Error('Argumento inseguro para cmd.exe');
    args = ['/d', '/s', '/c', `"${[cmd, ...args].map((a) => `"${a}"`).join(' ')}"`];
    cmd = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe');
    opcoes.windowsVerbatimArguments = true;
  }
  return { cmd, args, opcoes };
}

function rodar(preparado, acao) {
  const { cmd, args, opcoes } = preparado;
  const r = spawnSync(cmd, args, opcoes);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Comando falhou (${r.status ?? r.signal}): ${acao.cmd}\n${r.stderr ?? ''}`);
  return { stdout: r.stdout, stderr: r.stderr };
}

function sessao(home, dryRun, r, trabalho) {
  try {
    return comTrava(home, () => {
      const estado = lerEstado({ home });
      const persistir = () => { if (!dryRun) gravarEstado(estado, { home }); };
      const salvar = (item) => {
        const i = estado.itens.findIndex((x) => identidade(x) === identidade(item));
        if (i < 0) estado.itens.push(item); else estado.itens[i] = item;
        persistir();
      };
      const esquecer = (item) => {
        const i = estado.itens.findIndex((x) => identidade(x) === identidade(item));
        if (i >= 0) estado.itens.splice(i, 1);
        persistir();
      };
      // Comandos pendentes não são repetidos: nenhum hash de disco comprova o efeito de um processo externo.
      for (const item of [...estado.itens]) if (item.pendente) {
        if (item.tipo === 'comando') {
          r.avisos.push({ item, motivo: 'Comando pendente: confira o terceiro antes de repetir ou desinstalar' });
          continue;
        }
        conferirCaminho(item.destino);
        const st = existe(item.destino);
        const atual = st?.isFile() ? fs.readFileSync(item.destino) : null;
        const hash = atual ? hashConteudo(atual) : null;
        if ((!st || st.isFile()) && hash === item.hashDisco) {
          if (item.operacao === 'remover') esquecer(item); else salvar(confirmado(item));
        } else if ((!st || st.isFile()) && hash === item.hashAntes) {
          if (item.anterior) salvar(item.anterior); else esquecer(item);
        } else r.avisos.push({ item, motivo: 'Item pendente com conteúdo inesperado; mantido para revisão' });
      }
      trabalho({ estado, salvar, esquecer });
      return r;
    }, { dryRun });
  } catch (e) {
    r.ok = false;
    r.erros.push({ mensagem: e.message });
    return r;
  }
}

function efeito(item, anterior, atual, conteudo, contexto, r, acao, aplicar, status = 'executado') {
  const pendente = { ...item, pendente: true, operacao: status === 'removido' ? 'remover' : 'instalar',
    anterior: anterior ?? null, hashAntes: atual === null ? null : hashConteudo(atual),
    hashDisco: conteudo === null ? null : hashConteudo(conteudo) };
  contexto.salvar(pendente);
  const registro = { ...acao, status: r.dryRun ? 'previsto' : 'pendente' };
  r.acoes.push(registro);
  if (!r.dryRun) aplicar();
  if (status === 'removido') contexto.esquecer(item); else contexto.salvar(item);
  registro.status = r.dryRun ? 'previsto' : status;
}

/** Retorna { ok, dryRun, acoes, conflitos, avisos, erros }. Iguais e conflitos são pulados. */
export function executar(plano, { dryRun = false, force = false, home = os.homedir() } = {}) {
  const r = relatorio(dryRun);
  return sessao(home, dryRun, r, (contexto) => {
    const { estado } = contexto;
    const conflito = (acao, motivo) => { r.conflitos.push({ ...acao, motivo }); r.ok = false; };
    const aplicar = (acao) => {
      if (!['kit', 'ecc', 'impeccable'].includes(acao.dono) || !acao.cli) throw new Error('Ação exige dono e cli');
      if (acao.situacao === 'igual') { r.acoes.push({ ...acao, status: 'igual' }); return; }
      if (acao.situacao === 'conflito' && !force) { conflito(acao, 'Conflito identificado no plano'); return; }
      if (acao.tipo === 'comando') {
        const item = { ...acao, cwd: acao.cwd ?? home };
        const anterior = estado.itens.find((i) => identidade(i) === identidade(item));
        if (anterior?.pendente) { conflito(acao, 'Comando pendente; confira os efeitos antes de repetir'); return; }
        if (anterior && anterior.versao === item.versao
          && JSON.stringify(anterior.env ?? {}) === JSON.stringify(item.env ?? {})) {
          r.acoes.push({ ...acao, status: 'igual' });
          return;
        }
        const preparado = comando(acao, home);
        efeito(item, anterior, null, null, contexto, r, acao, () => {
          Object.assign(r.acoes.at(-1), rodar(preparado, acao));
        });
        return;
      }
      if (!['copiar', 'escrever', 'bloco'].includes(acao.tipo)) throw new Error(`Tipo desconhecido: ${acao.tipo}`);
      if (acao.tipo !== 'copiar' && typeof acao.conteudo !== 'string'
        && !(acao.tipo === 'escrever' && Buffer.isBuffer(acao.conteudo))) throw new Error('Ação exige conteúdo textual');
      const destino = path.resolve(acao.destino);
      conferirCaminho(destino);
      if (acao.tipo === 'copiar') {
        const st = fs.lstatSync(acao.origem);
        if (st.isSymbolicLink()) throw new Error(`Origem é link simbólico: ${acao.origem}`);
        if (st.isDirectory()) {
          const relativo = path.relative(path.resolve(acao.origem), destino);
          if (!relativo || (!relativo.startsWith(`..${path.sep}`) && relativo !== '..' && !path.isAbsolute(relativo))) {
            throw new Error('Destino de cópia não pode estar dentro da origem');
          }
          if (existe(destino) && !existe(destino).isDirectory()) { conflito(acao, 'Destino não é pasta'); return; }
          if (!dryRun) fs.mkdirSync(destino, { recursive: true });
          r.acoes.push({ ...acao, destino, status: dryRun ? 'previsto' : 'executado' });
          for (const nome of fs.readdirSync(acao.origem).sort()) aplicar({ ...acao, situacao: undefined,
            origem: path.join(acao.origem, nome), destino: path.join(destino, nome) });
          return;
        }
        if (!st.isFile()) throw new Error('Origem não é arquivo regular');
      }
      const st = existe(destino);
      if (st && !st.isFile()) { conflito(acao, 'Destino não é arquivo regular'); return; }
      const chave = { ...acao, destino };
      const anterior = estado.itens.find((i) => identidade(i) === identidade(chave));
      if (anterior?.pendente) { conflito(acao, 'Item pendente; conteúdo inesperado'); return; }
      const atual = st ? fs.readFileSync(destino) : null;
      let conteudo;
      let extra;
      if (acao.tipo === 'bloco') {
        const texto = atual ? utf8(atual) : '';
        if (texto === null) { conflito(acao, 'Arquivo não é UTF-8 válido'); return; }
        const bloco = trecho(texto);
        const novo = `${INICIO}\n${acao.conteudo}\n${FIM}`;
        if (trecho(novo)?.conteudo !== novo) throw new Error('Conteúdo contém marcadores reservados');
        if (bloco?.conteudo === novo) { r.acoes.push({ ...acao, status: 'igual' }); return; }
        if (bloco && !force && (!anterior || hashConteudo(bloco.conteudo) !== anterior.hash)) {
          conflito(acao, 'Bloco preexistente ou alterado'); return;
        }
        const separador = texto && !texto.endsWith('\n') ? '\n' : '';
        conteudo = bloco ? texto.slice(0, bloco.inicio) + novo + texto.slice(bloco.fim) : texto + separador + novo;
        extra = { hash: hashConteudo(novo), marcador: INICIO,
          separador: bloco ? anterior?.separador ?? '' : separador, criado: anterior?.criado ?? !st };
      } else {
        const esperado = acao.tipo === 'copiar' ? fs.readFileSync(acao.origem) : Buffer.from(acao.conteudo);
        let base;
        try { base = atual ? baseDoArquivo(atual, destino, estado.itens) : { bytes: null, sufixo: '' }; }
        catch (e) { conflito(acao, e.message); return; }
        if (base.bytes?.equals(esperado)) { r.acoes.push({ ...acao, status: 'igual' }); return; }
        if (st && !force && (!anterior || hashConteudo(base.bytes) !== anterior.hash)) {
          conflito(acao, 'Arquivo preexistente ou alterado'); return;
        }
        conteudo = Buffer.concat([esperado, Buffer.from(base.sufixo)]);
        extra = { hash: hashConteudo(esperado) };
      }
      const item = { tipo: acao.tipo, destino, dono: acao.dono, cli: acao.cli, ...extra };
      efeito(item, anterior, atual, conteudo, contexto, r, { ...acao, destino },
        () => escreverAtomico(destino, conteudo));
    };
    for (const acao of plano) {
      try { aplicar(acao); }
      catch (e) { r.ok = false; r.erros.push({ acao, mensagem: e.message }); break; }
    }
  });
}

/** Remove blocos antes dos arquivos; pendências são revalidadas antes de qualquer efeito. */
export function desinstalar({ home = os.homedir(), dryRun = false } = {}) {
  const r = relatorio(dryRun);
  return sessao(home, dryRun, r, (contexto) => {
    const { estado } = contexto;
    const ordem = [...estado.itens].reverse().sort((a, b) => Number(b.tipo === 'bloco') - Number(a.tipo === 'bloco'));
    const virtuais = new Map();
    for (const item of ordem) {
      try {
        if (item.pendente) { r.avisos.push({ item, motivo: 'Item pendente não foi removido' }); continue; }
        if (item.tipo === 'comando') {
          const inverso = item.desinstalar ?? item.desinstalacao ?? item.uninstall;
          if (!inverso) { r.avisos.push({ item, motivo: 'Comando sem desinstalação registrada; confirme os arquivos do terceiro' }); continue; }
          const acao = { ...inverso, cwd: inverso.cwd ?? item.cwd, env: { ...item.env, ...inverso.env } };
          const preparado = comando(acao, home);
          efeito(item, item, null, null, contexto, r, item, () => rodar(preparado, acao), 'removido');
          continue;
        }
        conferirCaminho(item.destino);
        const st = existe(item.destino);
        if (st && !st.isFile()) throw new Error('Destino não é arquivo regular');
        const atual = virtuais.has(item.destino) ? virtuais.get(item.destino) : st ? fs.readFileSync(item.destino) : null;
        if (atual === null) {
          contexto.esquecer(item);
          r.acoes.push({ ...item, status: 'ausente' });
          continue;
        }
        let restante = null;
        if (item.tipo === 'bloco') {
          const texto = utf8(atual);
          if (texto === null) { r.avisos.push({ item, motivo: 'Arquivo não é UTF-8 válido; mantido' }); continue; }
          const bloco = trecho(texto);
          if (!bloco) { contexto.esquecer(item); r.acoes.push({ ...item, status: 'ausente' }); continue; }
          if (hashConteudo(bloco.conteudo) !== item.hash) { r.avisos.push({ item, motivo: 'Bloco alterado; mantido' }); continue; }
          const textoRestante = semBloco(texto, bloco, item);
          restante = item.criado && textoRestante === '' ? null : Buffer.from(textoRestante);
        } else if (hashConteudo(atual) !== item.hash) {
          r.avisos.push({ item, motivo: 'Arquivo alterado; mantido' }); continue;
        }
        efeito(item, item, atual, restante, contexto, r, item, () => {
          if (restante === null) fs.unlinkSync(item.destino); else escreverAtomico(item.destino, restante);
        }, 'removido');
        if (dryRun) virtuais.set(item.destino, restante);
      } catch (e) { r.ok = false; r.erros.push({ item, mensagem: e.message }); break; }
    }
  });
}
