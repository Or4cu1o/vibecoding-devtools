import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caminhoEstado, lerEstado, gravarEstado, hashConteudo, versaoKit,
  escreverAtomico, comTrava, caminhoTrava } from './estado.mjs';
import { spawnSync } from 'node:child_process';

function ambiente(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-estado-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}

test('estado ausente não cria diretórios; hash SHA-256 funciona para bytes', (t) => {
  const op = ambiente(t);
  assert.deepEqual(lerEstado(op), { versao: versaoKit, data: null, itens: [] });
  assert.equal(fs.existsSync(caminhoEstado(op.home)), false);
  assert.equal(hashConteudo(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('grava e substitui estado completo com versão, data e sem temporários', (t) => {
  const op = ambiente(t);
  const itens = [{ tipo: 'escrever', destino: path.join(op.home, 'x'), hash: hashConteudo('x'), dono: 'kit', cli: 'codex' }];
  gravarEstado({ itens }, op);
  const estado = lerEstado(op);
  assert.deepEqual(estado.itens, itens);
  assert.equal(estado.versao, versaoKit);
  assert.ok(Number.isFinite(Date.parse(estado.data)));
  gravarEstado({ itens: [] }, op);
  assert.deepEqual(lerEstado(op).itens, []);
  assert.deepEqual(fs.readdirSync(path.dirname(caminhoEstado(op.home))), ['estado.json']);
});

test('JSON corrompido ou formato inválido não é ignorado', (t) => {
  const op = ambiente(t);
  gravarEstado({ itens: [] }, op);
  fs.writeFileSync(caminhoEstado(op.home), '{');
  assert.throws(() => lerEstado(op), SyntaxError);
  fs.writeFileSync(caminhoEstado(op.home), '{"versao":"1","itens":{}}');
  assert.throws(() => lerEstado(op), /inválido/);
});

test('falha na troca atômica mantém destino e limpa o temporário', (t) => {
  const op = ambiente(t);
  fs.mkdirSync(caminhoEstado(op.home), { recursive: true });
  fs.writeFileSync(path.join(caminhoEstado(op.home), 'preservado'), 'original');
  assert.throws(() => gravarEstado({ itens: [] }, op));
  assert.equal(fs.readFileSync(path.join(caminhoEstado(op.home), 'preservado'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(path.dirname(caminhoEstado(op.home))), ['estado.json']);
});

test('falha na escrita do temporário não trunca o destino e limpa o temporário', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'arquivo');
  fs.writeFileSync(destino, 'versão anterior');
  const escrever = fs.writeFileSync;
  const falha = t.mock.method(fs, 'writeFileSync', (arquivo, conteudo, ...args) => {
    if (conteudo === 'versão nova') {
      escrever(arquivo, 've', ...args);
      throw new Error('ENOSPC simulado');
    }
    return escrever(arquivo, conteudo, ...args);
  });
  assert.throws(() => escreverAtomico(destino, 'versão nova'), /ENOSPC/);
  falha.mock.restore();
  assert.equal(fs.readFileSync(destino, 'utf8'), 'versão anterior');
  assert.deepEqual(fs.readdirSync(op.home), ['arquivo']);
});

test('trava protege toda a transação contra outro processo e é liberada mesmo em exceção', (t) => {
  const op = ambiente(t);
  const url = new URL('./executar.mjs', import.meta.url).href;
  comTrava(op.home, () => {
    const velho = new Date(Date.now() - 86400000);
    fs.utimesSync(caminhoTrava(op.home), velho, velho); // PID vivo não expira por idade.
    const codigo = `import { executar } from ${JSON.stringify(url)};
      console.log(JSON.stringify(executar([{tipo:'escrever',dono:'kit',cli:'codex',
      destino:process.argv[1]+'/intruso',conteudo:'B'}],{home:process.argv[1]})));`;
    const filho = spawnSync(process.execPath, ['--input-type=module', '-e', codigo, op.home],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(filho.status, 0, filho.stderr);
    const resultado = JSON.parse(filho.stdout);
    assert.equal(resultado.ok, false);
    assert.match(resultado.erros[0].mensagem, /trava ativa/);
    assert.equal(fs.existsSync(path.join(op.home, 'intruso')), false);
    gravarEstado({ itens: [] }, op);
  });
  assert.equal(fs.existsSync(caminhoTrava(op.home)), false);
  assert.throws(() => comTrava(op.home, () => { throw new Error('interrupção'); }), /interrupção/);
  assert.equal(fs.existsSync(caminhoTrava(op.home)), false);
});

test('trava de PID encerrado é recuperada; trava incompleta recente é conservada', (t) => {
  const op = ambiente(t);
  const filho = spawnSync(process.execPath, ['-e', ''], { windowsHide: true });
  assert.equal(filho.status, 0);
  fs.mkdirSync(path.dirname(caminhoTrava(op.home)));
  fs.writeFileSync(caminhoTrava(op.home), JSON.stringify({ pid: filho.pid, token: 'processo-encerrado' }));
  assert.equal(comTrava(op.home, () => 'recuperada'), 'recuperada');
  assert.equal(fs.existsSync(caminhoTrava(op.home)), false);
  fs.writeFileSync(caminhoTrava(op.home), '');
  assert.throws(() => comTrava(op.home, () => assert.fail()), /trava ativa/);
  const velha = new Date(Date.now() - 60000);
  fs.utimesSync(caminhoTrava(op.home), velha, velha);
  assert.equal(comTrava(op.home, () => 'incompleta velha recuperada'), 'incompleta velha recuperada');
});

test('dry-run não cria trava e estado atômico preserva JSON anterior se rename falhar', (t) => {
  const op = ambiente(t);
  comTrava(op.home, () => assert.equal(fs.existsSync(caminhoTrava(op.home)), false), { dryRun: true });
  assert.deepEqual(fs.readdirSync(op.home), []);
  gravarEstado({ itens: [] }, op);
  const anterior = fs.readFileSync(caminhoEstado(op.home));
  const rename = fs.renameSync;
  const falha = t.mock.method(fs, 'renameSync', (origem, destino) => {
    if (destino === caminhoEstado(op.home)) throw new Error('rename indisponível');
    return rename(origem, destino);
  });
  assert.throws(() => gravarEstado({ itens: [{ tipo: 'comando' }] }, op), /rename/);
  falha.mock.restore();
  assert.deepEqual(fs.readFileSync(caminhoEstado(op.home)), anterior);
  assert.deepEqual(fs.readdirSync(path.dirname(caminhoEstado(op.home))), ['estado.json']);
});

test('falha ao escrever metadados da própria trava não deixa trava incompleta', (t) => {
  const op = ambiente(t);
  const escrever = fs.writeFileSync;
  const falha = t.mock.method(fs, 'writeFileSync', (arquivo, conteudo, ...args) => {
    if (typeof conteudo === 'string' && conteudo.includes('"token"')) throw new Error('falha na trava');
    return escrever(arquivo, conteudo, ...args);
  });
  assert.throws(() => comTrava(op.home, () => assert.fail()), /falha na trava/);
  falha.mock.restore();
  assert.equal(fs.existsSync(caminhoTrava(op.home)), false);
  assert.equal(comTrava(op.home, () => 'ok'), 'ok');
});
