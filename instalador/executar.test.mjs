import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executar, desinstalar, INICIO, FIM } from './executar.mjs';
import { lerEstado, caminhoEstado, hashConteudo, gravarEstado, comTrava } from './estado.mjs';
import { montarPlano } from './plano.mjs';
import { fileURLToPath } from 'node:url';

function ambiente(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-executar-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}
const escrever = (destino, conteudo = 'kit') => ({ tipo: 'escrever', dono: 'kit', cli: 'codex', destino, conteudo });
const bloco = (destino, conteudo = 'rules') => ({ ...escrever(destino, conteudo), tipo: 'bloco' });
const cmd = (codigo, extra = {}) => ({ tipo: 'comando', dono: 'ecc', cli: 'claude', cmd: process.execPath, args: ['-e', codigo], ...extra });

test('dry-run lista arquivos e comandos sem criar pastas, estado ou efeitos', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'nova', 'x');
  const r = executar([escrever(destino), bloco(path.join(op.home, 'AGENTS.md')), cmd('process.exit(9)')], { ...op, dryRun: true });
  assert.equal(r.ok, true);
  assert.equal(r.acoes.length, 3);
  assert.ok(r.acoes.every((a) => a.status === 'previsto'));
  assert.deepEqual(fs.readdirSync(op.home), []);
});

test('pula conteúdo igual sem assumir propriedade, atualiza próprios e respeita edições locais', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  fs.writeFileSync(destino, 'kit');
  const igual = executar([{ ...escrever(destino), situacao: 'igual' }], op);
  assert.equal(igual.ok, true);
  assert.equal(igual.acoes[0].status, 'igual');
  assert.equal(fs.existsSync(caminhoEstado(op.home)), false);
  assert.equal(executar([escrever(destino, 'instalado')], { ...op, force: true }).ok, true);
  assert.equal(executar([escrever(destino, 'atualizado')], op).ok, true);
  fs.writeFileSync(destino, 'editado');
  assert.equal(executar([escrever(destino)], op).conflitos.length, 1);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'editado');
  assert.equal(lerEstado(op).itens[0].hash, hashConteudo('atualizado'));
});

test('copia árvore com binários, registra cada arquivo e preserva conflitos internos', (t) => {
  const op = ambiente(t);
  const origem = path.join(op.home, 'origem');
  const destino = path.join(op.home, 'destino');
  fs.mkdirSync(path.join(origem, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(origem, 'sub', 'bin'), Buffer.from([0, 255, 128]));
  fs.writeFileSync(path.join(origem, 'a'), 'novo');
  fs.mkdirSync(destino);
  fs.writeFileSync(path.join(destino, 'a'), 'usuario');
  const acao = { tipo: 'copiar', dono: 'ecc', cli: 'claude', origem, destino };
  assert.equal(executar([acao], { ...op, dryRun: true }).conflitos.length, 1);
  assert.equal(fs.existsSync(path.join(destino, 'sub')), false);
  const r = executar([acao], op);
  assert.equal(r.conflitos.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(destino, 'sub', 'bin')), Buffer.from([0, 255, 128]));
  assert.equal(lerEstado(op).itens.length, 1);
  assert.equal(lerEstado(op).itens[0].dono, 'ecc');
  assert.equal(desinstalar(op).ok, true);
  assert.equal(fs.existsSync(path.join(destino, 'sub', 'bin')), false);
  assert.equal(fs.readFileSync(path.join(destino, 'a'), 'utf8'), 'usuario');
});

test('bloco preserva bytes externos na instalação, atualização e desinstalação', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  const original = 'minhas regras\r\nsem quebra final';
  fs.writeFileSync(destino, original);
  assert.equal(executar([bloco(destino)], op).ok, true);
  assert.equal(executar([bloco(destino, 'novas rules')], op).ok, true);
  fs.appendFileSync(destino, '\nmais regras\r\n');
  const antes = fs.readFileSync(destino, 'utf8');
  assert.equal(desinstalar({ ...op, dryRun: true }).acoes.length, 1);
  assert.equal(fs.readFileSync(destino, 'utf8'), antes);
  assert.equal(desinstalar(op).ok, true);
  assert.equal(fs.readFileSync(destino, 'utf8'), original + '\nmais regras\r\n');
  assert.deepEqual(lerEstado(op).itens, []);
});

test('blocos desconhecidos conflitam; blocos alterados ficam com aviso', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  fs.writeFileSync(destino, `antes\n${INICIO}\nusuario\n${FIM}\ndepois`);
  assert.equal(executar([bloco(destino)], op).conflitos.length, 1);
  assert.equal(executar([bloco(destino)], { ...op, force: true }).ok, true);
  fs.writeFileSync(destino, fs.readFileSync(destino, 'utf8').replace('rules', 'editado'));
  assert.equal(desinstalar(op).avisos.length, 1);
  assert.equal(lerEstado(op).itens.length, 1);
  assert.match(fs.readFileSync(destino, 'utf8'), /editado/);
});

test('bloco novo remove arquivo vazio; marcadores incompletos são erro', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  executar([bloco(destino)], op);
  desinstalar(op);
  assert.equal(fs.existsSync(destino), false);
  fs.writeFileSync(destino, INICIO);
  assert.equal(executar([bloco(destino)], op).erros.length, 1);
  assert.equal(fs.readFileSync(destino, 'utf8'), INICIO);
});

test('desinstalação mantém arquivos alterados e esquece arquivos já ausentes', (t) => {
  const op = ambiente(t);
  const a = path.join(op.home, 'a');
  const b = path.join(op.home, 'b');
  const c = path.join(op.home, 'c');
  executar([escrever(a), escrever(b), escrever(c)], op);
  fs.writeFileSync(a, 'edição');
  fs.unlinkSync(b);
  const estadoAntes = fs.readFileSync(caminhoEstado(op.home), 'utf8');
  const previa = desinstalar({ ...op, dryRun: true });
  assert.equal(previa.avisos.length, 1);
  assert.equal(fs.readFileSync(caminhoEstado(op.home), 'utf8'), estadoAntes);
  assert.equal(fs.existsSync(c), true);
  const r = desinstalar(op);
  assert.equal(r.avisos.length, 1);
  assert.equal(fs.existsSync(c), false);
  assert.deepEqual(lerEstado(op).itens.map((i) => i.destino), [a]);
});

test('comandos recebem args literais, cwd, ambiente e home falso; inverso é registrado', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'saida.json');
  const estranho = 'espaços & | > $() "aspas" %PATH%';
  const codigo = 'require("node:fs").writeFileSync("saida.json",JSON.stringify({arg:process.argv[1],cwd:process.cwd(),home:process.env.HOME,user:process.env.USERPROFILE,extra:process.env.VBD_TESTE}))';
  const acao = cmd(codigo, { args: ['-e', codigo, estranho], env: { VBD_TESTE: 'valor' }, desinstalar: { cmd: process.execPath, args: ['-e', 'require("node:fs").unlinkSync("saida.json")'] } });
  assert.equal(executar([acao], op).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(destino, 'utf8')), { arg: estranho, cwd: op.home, home: op.home, user: op.home, extra: 'valor' });
  assert.equal(desinstalar({ ...op, dryRun: true }).ok, true);
  assert.equal(fs.existsSync(destino), true);
  assert.equal(desinstalar(op).ok, true);
  assert.equal(fs.existsSync(destino), false);
  assert.deepEqual(lerEstado(op).itens, []);
});

test('comando sem inverso fica registrado com aviso; falha para e conserva progresso', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'instalado');
  const r = executar([escrever(destino), cmd('process.exit(7)'), escrever(path.join(op.home, 'nao'))], op);
  assert.equal(r.ok, false);
  assert.match(r.erros[0].mensagem, /7/);
  assert.equal(lerEstado(op).itens.length, 2);
  assert.equal(lerEstado(op).itens[1].pendente, true);
  assert.equal(executar([cmd('process.exit(7)')], op).conflitos.length, 1);
  assert.equal(fs.existsSync(path.join(op.home, 'nao')), false);
  assert.equal(executar([cmd('')], op).ok, true);
  assert.ok(desinstalar(op).avisos.length >= 2);
  assert.equal(lerEstado(op).itens[0].tipo, 'comando');
});

test('situações iguais pulam; conflitos de árvore pulam antes de expandir, salvo force', (t) => {
  const op = ambiente(t);
  const origem = path.join(op.home, 'origem');
  const destino = path.join(op.home, 'destino');
  fs.mkdirSync(origem);
  fs.writeFileSync(path.join(origem, 'x'), 'kit');
  const acao = { tipo: 'copiar', dono: 'kit', cli: 'codex', origem, destino };
  assert.equal(executar([{ ...acao, situacao: 'conflito' }], op).conflitos.length, 1);
  assert.equal(fs.existsSync(destino), false);
  assert.equal(executar([{ ...acao, situacao: 'igual' }], op).acoes[0].status, 'igual');
  assert.equal(fs.existsSync(destino), false);
  assert.equal(executar([{ ...acao, situacao: 'conflito' }], { ...op, force: true }).ok, true);
  assert.equal(fs.readFileSync(path.join(destino, 'x'), 'utf8'), 'kit');
});

test('nova e atualizar revalidam alterações posteriores ao plano', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  const nova = { ...escrever(destino), situacao: 'nova' };
  fs.writeFileSync(destino, 'arquivo externo criado depois');
  assert.equal(executar([nova], op).conflitos.length, 1);
  assert.equal(executar([nova], { ...op, force: true }).ok, true);
  fs.writeFileSync(destino, 'edição após o resumo');
  assert.equal(executar([{ ...escrever(destino, 'novo'), situacao: 'atualizar' }], op).conflitos.length, 1);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'edição após o resumo');
});

test('comando confirmado no estado não se repete por um plano nova desatualizado', (t) => {
  const op = ambiente(t);
  const codigo = 'require("node:fs").appendFileSync("vezes.txt","x")';
  const acao = { ...cmd(codigo), situacao: 'nova' };
  assert.equal(executar([acao], op).ok, true);
  const repetido = executar([acao], op);
  assert.equal(repetido.ok, true);
  assert.equal(repetido.acoes[0].status, 'igual');
  assert.equal(fs.readFileSync(path.join(op.home, 'vezes.txt'), 'utf8'), 'x');
});

test('falha na troca atômica do destino preserva anterior e pendência permite retomar', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  executar([escrever(destino, 'anterior')], op);
  const rename = fs.renameSync;
  const falha = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === destino) throw new Error('falha de rename no destino');
    return rename(a, b);
  });
  const resultado = executar([escrever(destino, 'novo')], op);
  falha.mock.restore();
  assert.equal(resultado.ok, false);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'anterior');
  assert.equal(lerEstado(op).itens[0].pendente, true);
  assert.equal(executar([escrever(destino, 'novo')], op).ok, true);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'novo');
  assert.equal(lerEstado(op).itens[0].pendente, undefined);
  assert.equal(fs.readdirSync(op.home).some((n) => n.endsWith('.tmp')), false);
});

test('estado pendente precede efeito e confirmação falha sem perder propriedade do arquivo', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  const rename = fs.renameSync;
  let gravacoes = 0;
  const falha = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === caminhoEstado(op.home) && ++gravacoes === 2) throw new Error('falha ao confirmar estado');
    if (b === destino) assert.equal(lerEstado(op).itens[0].pendente, true);
    return rename(a, b);
  });
  const resultado = executar([escrever(destino)], op);
  falha.mock.restore();
  assert.equal(resultado.ok, false);
  assert.equal(resultado.acoes[0].status, 'pendente');
  assert.equal(fs.readFileSync(destino, 'utf8'), 'kit');
  assert.equal(lerEstado(op).itens[0].pendente, true);
  assert.equal(executar([{ ...escrever(destino), situacao: 'igual' }], op).ok, true);
  assert.equal(lerEstado(op).itens[0].pendente, undefined);
  assert.equal(desinstalar(op).ok, true);
  assert.equal(fs.existsSync(destino), false);
});

test('falha ao registrar pendência não aplica efeito; pendência com edição local é preservada', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  const rename = fs.renameSync;
  const falha = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === caminhoEstado(op.home)) throw new Error('estado indisponível');
    return rename(a, b);
  });
  assert.equal(executar([escrever(destino)], op).ok, false);
  assert.equal(fs.existsSync(destino), false);
  falha.mock.restore();
  fs.writeFileSync(destino, 'alteração local');
  gravarEstado({ itens: [{ ...escrever(destino), pendente: true, operacao: 'instalar', anterior: null,
    hash: hashConteudo('kit'), hashAntes: null, hashDisco: hashConteudo('kit') }] }, op);
  assert.equal(executar([escrever(destino)], op).conflitos.length, 1);
  assert.equal(desinstalar(op).avisos.length >= 1, true);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'alteração local');
  assert.equal(lerEstado(op).itens[0].pendente, true);
});

test('remoção pendente é recuperada pelo hash, inclusive bloco com contexto externo', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  fs.writeFileSync(destino, 'usuário\n');
  executar([bloco(destino)], op);
  const rename = fs.renameSync;
  let gravacoes = 0;
  const falha = t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === caminhoEstado(op.home) && ++gravacoes === 2) throw new Error('falha no estado após remover bloco');
    return rename(a, b);
  });
  assert.equal(desinstalar(op).ok, false);
  falha.mock.restore();
  assert.equal(fs.readFileSync(destino, 'utf8'), 'usuário\n');
  assert.equal(lerEstado(op).itens[0].operacao, 'remover');
  assert.equal(desinstalar(op).ok, true);
  assert.deepEqual(lerEstado(op).itens, []);
  assert.equal(fs.readFileSync(destino, 'utf8'), 'usuário\n');
});

test('bloco rejeita UTF-16 e UTF-8 inválido sem alterar bytes, mesmo com force', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  for (const bytes of [Buffer.from([255, 254, 65, 0]), Buffer.from([254, 255, 0, 65]), Buffer.from([128, 255])]) {
    fs.writeFileSync(destino, bytes);
    const resultado = executar([bloco(destino)], { ...op, force: true });
    assert.equal(resultado.conflitos.length, 1);
    assert.deepEqual(fs.readFileSync(destino), bytes);
  }
  assert.deepEqual(lerEstado(op).itens, []);
});

test('Windows resolve comando sem extensão pelo PATH/PATHEXT e protege argumentos',
  { skip: process.platform !== 'win32' }, (t) => {
    const op = ambiente(t);
    const pasta = path.join(op.home, 'pasta com espaço');
    fs.mkdirSync(pasta);
    fs.writeFileSync(path.join(pasta, 'wrapper.cmd'), '@echo off\r\n> "%~3" echo "[%~1][%~2]"\r\n');
    const acao = { tipo: 'comando', dono: 'ecc', cli: 'claude', cmd: 'wrapper',
      args: ['um espaco', 'a&b', 'resultado.txt'], env: { PATH: pasta, PATHEXT: '.EXE;.CMD' } };
    assert.equal(executar([acao], op).ok, true);
    assert.equal(fs.readFileSync(path.join(op.home, 'resultado.txt'), 'utf8').trim(), '"[um espaco][a&b]"');
    for (const arg of ['%PATH%', 'a"&echo perigo', '!VAR!', 'a\nb']) {
      assert.equal(executar([{ ...acao, args: [arg] }], op).ok, false);
    }
  });

test('trava ativa impede outra execução de modificar o disco ou perder registros', (t) => {
  const op = ambiente(t);
  comTrava(op.home, () => {
    const r = executar([escrever(path.join(op.home, 'bloqueado'))], op);
    assert.equal(r.ok, false);
    assert.match(r.erros[0].mensagem, /trava ativa/);
    assert.equal(fs.existsSync(path.join(op.home, 'bloqueado')), false);
  });
  assert.equal(executar([escrever(path.join(op.home, 'livre'))], op).ok, true);
});

test('integração com kit real: plano, instalação, repetição, atualização do bloco e desinstalação', (t) => {
  const op = ambiente(t);
  const projeto = path.join(op.home, 'projeto com espaço');
  const caminhos = { ...op, projeto, kit: fileURLToPath(new URL('../', import.meta.url)), ecc: null };
  const escolhas = { clis: ['claude', 'codex', 'agy'], escopo: 'projeto', maestri: false, ecc: { clis: [] } };
  const plano = montarPlano(escolhas, {}, caminhos);
  const primeiro = executar(plano, op);
  assert.equal(primeiro.ok, true, JSON.stringify(primeiro.erros));
  const agents = path.join(projeto, 'AGENTS.md');
  assert.deepEqual(lerEstado(op).itens.filter((i) => i.destino === agents).map((i) => i.tipo), ['copiar', 'bloco']);
  const repetido = montarPlano(escolhas, {}, caminhos);
  assert.ok(repetido.every((a) => a.situacao === 'igual'));
  assert.equal(executar(repetido, op).ok, true);
  const atualizado = montarPlano({ ...escolhas, maestri: true }, {}, caminhos);
  assert.equal(atualizado.find((a) => a.tipo === 'bloco').situacao, 'atualizar');
  assert.equal(executar(atualizado, op).ok, true);
  const antes = fs.readFileSync(agents);
  const previa = desinstalar({ ...op, dryRun: true });
  assert.equal(previa.ok, true);
  assert.equal(previa.avisos.length, 0);
  assert.deepEqual(fs.readFileSync(agents), antes);
  assert.equal(desinstalar(op).ok, true);
  assert.deepEqual(lerEstado(op).itens, []);
  assert.equal(fs.existsSync(agents), false);
  assert.equal(fs.existsSync(path.join(projeto, 'CLAUDE.md')), false);
});

test('remover bloco antes do arquivo preserva edições externas do usuário no modelo', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'AGENTS.md');
  executar([escrever(destino, '# Modelo\n'), bloco(destino)], op);
  fs.appendFileSync(destino, '\n# Minha edição\n');
  const resultado = desinstalar(op);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.avisos.length, 1);
  assert.equal(fs.readFileSync(destino, 'utf8'), '# Modelo\n\n# Minha edição\n');
  assert.equal(lerEstado(op).itens[0].tipo, 'escrever');
});

test('comando inexistente e args string são erros, sem gravar estado', (t) => {
  const op = ambiente(t);
  assert.equal(executar([cmd('', { cmd: path.join(op.home, 'inexistente') })], op).ok, false);
  assert.equal(executar([cmd('', { args: '--version' })], op).ok, false);
  assert.equal(fs.existsSync(caminhoEstado(op.home)), false);
});

test('Windows executa .cmd e .bat por cmd.exe com argumentos entre aspas', { skip: process.platform !== 'win32' }, (t) => {
  const op = ambiente(t);
  for (const ext of ['cmd', 'bat']) {
    const script = path.join(op.home, `com espaço.${ext}`);
    fs.writeFileSync(script, '@echo off\r\n> "%~3" echo "[%~1][%~2]"\r\n');
    const acao = cmd('', { cmd: script, args: ['um espaco', 'a&b', 'resultado.txt'] });
    const r = executar([acao], op);
    assert.equal(r.ok, true, JSON.stringify(r.erros));
    assert.equal(fs.readFileSync(path.join(op.home, 'resultado.txt'), 'utf8').trim(), '"[um espaco][a&b]"');
  }
});

test('cópia não segue junctions e recusa destino dentro da origem', (t) => {
  const op = ambiente(t);
  const origem = path.join(op.home, 'origem');
  const externo = path.join(op.home, 'externo');
  const link = path.join(op.home, 'link');
  fs.mkdirSync(origem);
  fs.mkdirSync(externo);
  fs.writeFileSync(path.join(externo, 'x'), 'usuario');
  fs.symlinkSync(externo, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(executar([escrever(path.join(link, 'x'))], { ...op, force: true }).erros.length, 1);
  assert.equal(fs.readFileSync(path.join(externo, 'x'), 'utf8'), 'usuario');
  assert.equal(executar([{ tipo: 'copiar', dono: 'kit', cli: 'codex', origem, destino: path.join(origem, 'dentro') }], op).erros.length, 1);
});

test('copia arquivo isolado e pasta vazia; dry-run lista pasta sem criá-la', (t) => {
  const op = ambiente(t);
  const origem = path.join(op.home, 'origem');
  const destino = path.join(op.home, 'pasta');
  fs.mkdirSync(origem);
  const acao = { tipo: 'copiar', dono: 'kit', cli: 'claude', origem, destino };
  assert.equal(executar([acao], { ...op, dryRun: true }).acoes.length, 1);
  assert.equal(fs.existsSync(destino), false);
  assert.equal(executar([acao], op).ok, true);
  assert.equal(fs.statSync(destino).isDirectory(), true);
  fs.writeFileSync(path.join(origem, 'x'), 'bytes');
  assert.equal(executar([{ ...acao, origem: path.join(origem, 'x'), destino: path.join(destino, 'x') }], op).ok, true);
  assert.equal(fs.readFileSync(path.join(destino, 'x'), 'utf8'), 'bytes');
});

test('erro no desinstalador para a remoção e preserva o registro para tentar depois', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'x');
  executar([escrever(destino), cmd('', { desinstalar: { cmd: process.execPath, args: ['-e', 'process.exit(8)'] } })], op);
  const r = desinstalar(op);
  assert.equal(r.ok, false);
  assert.match(r.erros[0].mensagem, /8/);
  assert.equal(fs.existsSync(destino), true);
  assert.equal(lerEstado(op).itens.length, 2);
});
