import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, resumirPlano, planejarInstalacao, formatarDeteccao } from './cli.mjs';
import { executar } from './executar.mjs';
import { caminhoEstado, lerEstado } from './estado.mjs';
import { escolhasDasFlags, Cancelamento } from './painel.mjs';
import * as apiTerceiros from './terceiros.mjs';

const deteccao = () => ({ node: { ok: true, versao: '22.0.0', minimo: 22 }, git: { ok: true, versao: '2.0.0' }, gitleaks: { ok: false, erro: 'ausente' }, clis: [{ id: 'codex', nome: 'Codex', estado: 'ok', caminho: '/bin/codex' }], projeto: { emRepositorio: false, motivo: 'fora de git', stacks: [] },
  plugins: Object.fromEntries(['claude', 'codex', 'agy'].map((cli) => [cli, { estado: 'conhecido', itens: [] }])) });
const escrever = (destino, conteudo = 'kit') => ({ tipo: 'escrever', dono: 'kit', cli: 'codex', destino, conteudo });
function ambiente(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'vbd-cli-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const home = path.join(raiz, 'home');
  const stdout = [], stderr = [];
  return { raiz, home, stdout, stderr, isTTY: false, out: (s) => stdout.push(s), err: (s) => stderr.push(s), detectar: deteccao,
    escolher: () => { throw new Error('painel chamado sem TTY'); }, confirmar: () => { throw new Error('confirmação chamada sem TTY'); },
    planejar: () => [escrever(path.join(home, 'arquivo'))] };
}
const json = (op) => { assert.equal(op.stdout.length, 1); return JSON.parse(op.stdout[0]); };

test('detectar mantém JSON e código de saída, sem criar estado ou chamar painel', async (t) => {
  const op = ambiente(t);
  assert.equal(await main(['detectar', '--json'], op), 0);
  assert.deepEqual(json(op), deteccao());
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  assert.equal(await main(['detectar', '--json'], { ...op, detectar: () => ({ ...deteccao(), git: { ok: false } }) }), 1);
  assert.equal(json(op).git.ok, false);
});

test('instalar padrão com --yes sem TTY usa contrato, escreve e registra estado', async (t) => {
  const op = ambiente(t);
  let recebido;
  assert.equal(await main(['--yes', '--json', '--maestri'], { ...op, planejar: (e, d, caminhos) => { recebido = { e, d, caminhos }; return op.planejar(); } }), 0);
  assert.equal(fs.readFileSync(path.join(op.home, 'arquivo'), 'utf8'), 'kit');
  assert.equal(recebido.e.maestri, true);
  assert.deepEqual(recebido.e.clis, ['codex']);
  assert.equal(recebido.caminhos.home, op.home);
  assert.deepEqual(recebido.d.instalados.estado.itens, []);
  assert.equal(json(op).avisos.length, 1);
  assert.equal(lerEstado({ home: op.home }).itens.length, 1);
});

test('dry-run JSON sem TTY e sem --yes não grava nada', async (t) => {
  const op = ambiente(t);
  assert.equal(await main(['--dry-run', '--json'], op), 0);
  assert.equal(json(op).resumo.acoes[0].situacao, 'nova');
  assert.equal(fs.existsSync(op.home), false);
});

test('sem TTY requer --yes para escrever e para desinstalar', async (t) => {
  const op = ambiente(t);
  assert.equal(await main(['--json'], op), 1);
  assert.match(json(op).erro, /--yes/);
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  executar(op.planejar(), { home: op.home });
  assert.equal(await main(['uninstall', '--json'], op), 1);
  assert.match(json(op).erro, /--yes/);
  assert.equal(fs.existsSync(path.join(op.home, 'arquivo')), true);
});

test('pré-requisitos param antes de escolhas ou aplicação; gitleaks é só aviso', async (t) => {
  const op = ambiente(t);
  assert.equal(await main(['--yes', '--json'], { ...op, detectar: () => ({ ...deteccao(), node: { ok: false } }) }), 1);
  assert.match(json(op).erro, /Node >=22/);
  assert.equal(fs.existsSync(op.home), false);
});

test('resumo distingue nova, igual, atualizar e conflito e não adota arquivo alheio igual', (t) => {
  const op = ambiente(t);
  const destino = path.join(op.home, 'arquivo');
  assert.equal(resumirPlano(op.planejar(), { home: op.home }).acoes[0].situacao, 'nova');
  executar(op.planejar(), { home: op.home });
  assert.equal(resumirPlano(op.planejar(), { home: op.home }).acoes[0].situacao, 'igual');
  assert.equal(resumirPlano([escrever(destino, 'novo')], { home: op.home }).acoes[0].situacao, 'atualizar');
  fs.writeFileSync(destino, 'edição');
  assert.equal(resumirPlano(op.planejar(), { home: op.home }).acoes[0].situacao, 'conflito');
  assert.equal(resumirPlano(op.planejar(), { home: op.home, force: true }).acoes[0].situacao, 'atualizar');
  const outro = path.join(op.home, 'outro');
  fs.writeFileSync(outro, 'kit');
  assert.equal(resumirPlano([escrever(outro)], { home: op.home }).acoes[0].situacao, 'igual');
  assert.equal(resumirPlano([escrever(outro)], { home: op.home, force: true }).acoes[0].situacao, 'igual');
});

test('iguais são pulados sem regravar arquivo ou estado, conflitos ficam e force substitui', async (t) => {
  const op = ambiente(t);
  executar(op.planejar(), { home: op.home });
  const antes = fs.readFileSync(caminhoEstado(op.home), 'utf8');
  assert.equal(await main(['--yes', '--json'], op), 0);
  assert.equal(json(op).acoes.length, 0);
  assert.equal(fs.readFileSync(caminhoEstado(op.home), 'utf8'), antes);
  op.stdout.length = 0;
  fs.writeFileSync(path.join(op.home, 'arquivo'), 'edição');
  assert.equal(await main(['--yes', '--json'], op), 1);
  assert.equal(json(op).conflitos.length, 1);
  assert.equal(fs.readFileSync(path.join(op.home, 'arquivo'), 'utf8'), 'edição');
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--force', '--json'], op), 0);
  assert.equal(json(op).acoes.length, 1);
  assert.equal(fs.readFileSync(path.join(op.home, 'arquivo'), 'utf8'), 'kit');
});

test('cópias de pastas não reaplicam arquivos iguais nem sobrescrevem conflitos', async (t) => {
  const op = ambiente(t);
  const origem = path.join(op.raiz, 'origem');
  fs.mkdirSync(origem);
  fs.writeFileSync(path.join(origem, 'a'), 'a');
  fs.writeFileSync(path.join(origem, 'b'), 'b');
  const plano = [{ tipo: 'copiar', dono: 'kit', cli: 'codex', origem, destino: path.join(op.home, 'skill') }];
  const config = { ...op, planejar: () => plano };
  assert.equal(await main(['--yes', '--json'], config), 0);
  op.stdout.length = 0;
  fs.writeFileSync(path.join(op.home, 'skill', 'b'), 'edição');
  assert.equal(await main(['--yes', '--json'], config), 1);
  assert.equal(json(op).acoes.length, 0);
  assert.equal(fs.readFileSync(path.join(op.home, 'skill', 'b'), 'utf8'), 'edição');
});

test('desinstalar tem dry-run e --yes sem TTY, preservando alterados com aviso', async (t) => {
  const op = ambiente(t);
  executar([...op.planejar(), escrever(path.join(op.home, 'editado'))], { home: op.home });
  fs.writeFileSync(path.join(op.home, 'editado'), 'edição');
  assert.equal(await main(['desinstalar', '--dry-run', '--json'], op), 0);
  assert.equal(json(op).avisos.length, 1);
  assert.equal(fs.existsSync(path.join(op.home, 'arquivo')), true);
  op.stdout.length = 0;
  assert.equal(await main(['uninstall', '--yes', '--json'], op), 0);
  assert.ok(json(op).avisos.some((a) => a.motivo.includes('alterado')));
  assert.equal(fs.existsSync(path.join(op.home, 'arquivo')), false);
  assert.equal(fs.existsSync(path.join(op.home, 'editado')), true);
});

test('TTY pede confirmação após resumo; recusa e cancelamento não escrevem', async (t) => {
  const op = ambiente(t);
  let chamadas = 0;
  const tty = { ...op, isTTY: true, escolher: async (d) => escolhasDasFlags({}, d), confirmar: async () => { chamadas++; assert.ok(op.stdout.some((s) => s.includes('Resumo:'))); return false; } };
  assert.equal(await main([], tty), 0);
  assert.equal(chamadas, 1);
  assert.equal(fs.existsSync(op.home), false);
  assert.equal(await main([], { ...tty, escolher: () => { throw new Cancelamento(); } }), 0);
  assert.equal(chamadas, 1);
  assert.equal(await main([], { ...tty, confirmar: async () => true }), 0);
  assert.equal(fs.existsSync(path.join(op.home, 'arquivo')), true);
});

test('integração real com plano do kit e executor em home temporário', async (t) => {
  const op = ambiente(t);
  const { planejar, ...config } = op;
  assert.equal(await main(['--yes', '--json', '--clis=codex'], config), 0);
  assert.equal(json(op).ok, true);
  assert.ok(fs.existsSync(path.join(op.home, '.codex', 'AGENTS.md')));
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--json', '--clis=codex'], config), 0);
  assert.equal(json(op).acoes.length, 0);
});

test('situação igual do plano preserva modelo AGENTS com bloco e instalação idêntica externa', async (t) => {
  const op = ambiente(t);
  const { planejar, ...config } = op;
  const projeto = path.join(op.raiz, 'projeto');
  fs.mkdirSync(projeto);
  config.detectar = () => ({ ...deteccao(), projeto: { emRepositorio: true, raiz: projeto, stacks: [] } });
  const args = ['--yes', '--json', '--clis=codex', '--projeto'];
  assert.equal(await main(args, config), 0);
  op.stdout.length = 0;
  const agentes = fs.readFileSync(path.join(projeto, 'AGENTS.md'), 'utf8');
  assert.equal(await main(args, config), 0);
  assert.equal(json(op).acoes.length, 0);
  assert.equal(fs.readFileSync(path.join(projeto, 'AGENTS.md'), 'utf8'), agentes);
  const externo = path.join(op.home, 'externo');
  fs.writeFileSync(externo, 'kit');
  const resumo = resumirPlano([{ ...escrever(externo), situacao: 'igual' }], { home: op.home });
  assert.equal(resumo.acoes[0].situacao, 'igual');
  assert.equal(lerEstado({ home: op.home }).itens.some((i) => i.destino === externo), false);
});

test('encaixe de terceiros preserva ordem, caminhos e dry-run resumido sem cache', async (t) => {
  const op = ambiente(t);
  assert.equal(await main(['--dry-run', '--json', '--ecc=claude'], { ...op, terceiros: terceirosFalsos(op) }), 0);
  assert.ok(json(op).resumo.acoes.some((a) => a.tipo === 'resumo' && a.descricao.includes('v2.2.3')));
  assert.equal(fs.existsSync(op.home), false);
  const escolhas = escolhasDasFlags({ ecc: 'codex' }, deteccao());
  const antes = structuredClone(escolhas);
  const terceiro = { tipo: 'comando', dono: 'ecc', cli: 'codex', cmd: process.execPath, args: ['--version'] };
  const plano = await planejarInstalacao(escolhas, deteccao(), { home: op.home }, {
    prepararTerceiros: async () => ({ acoes: [terceiro], caminhos: { ecc: '/cache/ecc' } }),
    planejar: (e, d, caminhos) => { assert.equal(caminhos.ecc, '/cache/ecc'); return op.planejar(); },
  });
  assert.deepEqual([...plano], [terceiro, ...op.planejar()]);
  assert.deepEqual(escolhas, antes);
});

// Usa o planejamento real de terceiros, substituindo apenas os executáveis e a obtenção da fonte.
function terceirosFalsos(op, { aoObter = () => {}, situacao, avisos = [] } = {}) {
  const api = { ...apiTerceiros };
  api.detectarTerceiros = (home, projeto) => {
    assert.equal(home, op.home);
    return { ...apiTerceiros.detectarTerceiros(home, projeto), avisos };
  };
  api.acoesTerceiros = (escolhas, d, caminhos) => {
    const reais = apiTerceiros.acoesTerceiros(escolhas, d, caminhos);
    const acoes = reais.map((a) => {
      const telemetry = a.args.includes('telemetry');
      const arquivo = path.join(op.home, a.dono === 'ecc' ? '.claude/ecc-simulado' : '.agents/impeccable-simulado');
      const codigo = telemetry ? '' : 'const fs=require("node:fs"),p=require("node:path");fs.mkdirSync(p.dirname(process.argv[1]),{recursive:true});fs.writeFileSync(process.argv[1],"terceiro")';
      return { ...a, cmd: process.execPath, args: ['-e', codigo, arquivo],
        ...(situacao ? { situacao } : {}),
        ...(a.desinstalar ? { desinstalar: { cmd: process.execPath, args: ['-e', 'require("node:fs").unlinkSync(process.argv[1])', arquivo], cwd: op.home } } : {}) };
    });
    acoes.avisos = reais.avisos;
    return acoes;
  };
  api.obterEcc = (cache) => {
    assert.equal(cache, path.join(op.home, '.vibecoding-devtools/cache'));
    aoObter();
    const ecc = path.join(cache, 'ecc-2.2.3');
    for (const pacote of ['common', 'web', 'typescript']) {
      fs.mkdirSync(path.join(ecc, 'rules', pacote), { recursive: true });
      fs.writeFileSync(path.join(ecc, 'rules', pacote, 'style.md'), `# ${pacote}\n`);
    }
    return ecc;
  };
  return api;
}

function arvore(raiz, prefixo = '') {
  if (!fs.existsSync(raiz)) return {};
  const saida = {};
  for (const nome of fs.readdirSync(raiz).sort()) {
    const p = path.join(raiz, nome), rel = prefixo + nome;
    if (fs.lstatSync(p).isDirectory()) Object.assign(saida, { [rel + '/']: null }, arvore(p, rel + '/'));
    else saida[rel] = fs.readFileSync(p).toString('base64');
  }
  return saida;
}

test('ponta a ponta sem rede: dry-run, confirmação, ECC/Impeccable, kit e desinstalação', async (t) => {
  const op = ambiente(t);
  fs.mkdirSync(path.join(op.home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(op.home, '.codex/AGENTS.md'), 'Regras pessoais sem quebra final');
  fs.writeFileSync(path.join(op.home, 'pessoal'), 'não alterar');
  const projeto = path.join(op.raiz, 'projeto');
  fs.mkdirSync(projeto);
  const inicial = arvore(op.home);
  let confirmacoes = 0, downloads = 0;
  const { planejar, ...config } = op;
  config.detectar = () => ({ ...deteccao(), projeto: { emRepositorio: true, raiz: projeto, stacks: ['typescript'] } });
  config.terceiros = terceirosFalsos(op, { aoObter: () => { assert.equal(confirmacoes, 1); downloads++; }, avisos: ['aviso de detecção preservado'] });
  const flags = ['--clis=codex', '--ecc=claude', '--impeccable=codex'];
  assert.equal(await main([...flags, '--dry-run', '--json'], config), 0);
  const previa = json(op);
  assert.equal(downloads, 0);
  assert.deepEqual(arvore(op.home), inicial);
  assert.ok(previa.resumo.acoes.some((a) => a.tipo === 'resumo' && /Baixar o ECC v2.2.3/.test(a.descricao)));
  assert.ok(previa.avisos.some((a) => a.includes('aviso de detecção')));
  assert.ok(previa.avisos.some((a) => a.includes('não oferece desinstalação')));
  op.stdout.length = 0;
  assert.equal(await main(flags, { ...config, isTTY: true, confirmar: async () => { confirmacoes++; assert.deepEqual(arvore(op.home), inicial); return true; } }), 0);
  assert.equal(downloads, 1);
  assert.ok(op.stdout.some((s) => s.includes('aviso de detecção preservado')));
  assert.ok(fs.existsSync(path.join(op.home, '.claude/rules/ecc/common/style.md')));
  assert.ok(fs.existsSync(path.join(op.home, '.claude/ecc-simulado')));
  assert.ok(fs.existsSync(path.join(op.home, '.agents/impeccable-simulado')));
  op.stdout.length = 0;
  assert.equal(await main([...flags, '--yes', '--json'], config), 0);
  assert.equal(json(op).acoes.length, 0);
  assert.equal(downloads, 1);
  op.stdout.length = 0;
  assert.equal(await main(['uninstall', '--yes', '--json'], config), 0);
  const removido = json(op);
  assert.ok(removido.avisos.some((a) => a.motivo.includes('sem desinstalação')));
  assert.ok(removido.avisos.some((a) => a.item?.args?.includes(path.join(op.home, '.agents/impeccable-simulado'))));
  assert.ok(removido.avisos.some((a) => a.destino === path.join(op.home, '.vibecoding-devtools')));
  const final = arvore(op.home);
  for (const [p, conteudo] of Object.entries(inicial)) assert.equal(final[p], conteudo, p);
  const excecoes = removido.avisos.filter((a) => a.destino).map((a) => path.relative(op.home, a.destino).split(path.sep).join('/'));
  // Impeccable não tem inverso: o comando e o aviso original continuam no estado.
  excecoes.push('.agents/impeccable-simulado');
  assert.ok(lerEstado({ home: op.home }).itens.every((i) => i.tipo === 'comando' && i.dono === 'impeccable'));
  for (const p of Object.keys(final).filter((p) => !(p in inicial))) {
    const caminho = p.replace(/\/$/, '');
    assert.ok(excecoes.some((e) => caminho === e || caminho.startsWith(e + '/') || (p.endsWith('/') && e.startsWith(p))), `Remanescente não avisado: ${p}`);
  }
});

test('recusa, --json sem --yes e dry-run com cache nunca obtêm ECC', async (t) => {
  const op = ambiente(t);
  let downloads = 0;
  const api = terceirosFalsos(op, { aoObter: () => { downloads++; } });
  const config = { ...op, terceiros: api, isTTY: true, confirmar: async () => false };
  assert.equal(await main(['--ecc=claude'], config), 0);
  assert.equal(downloads, 0);
  assert.equal(fs.existsSync(op.home), false);
  op.stdout.length = 0;
  assert.equal(await main(['--ecc=claude', '--json'], config), 1);
  assert.match(json(op).erro, /--yes/);
  assert.equal(downloads, 0);
  api.obterEcc(path.join(op.home, '.vibecoding-devtools/cache'));
  const antes = arvore(op.home);
  op.stdout.length = 0;
  const { planejar, ...real } = config;
  assert.equal(await main(['--ecc=claude', '--dry-run', '--json'], real), 0);
  assert.ok(!json(op).resumo.acoes.some((a) => a.tipo === 'resumo'));
  assert.deepEqual(arvore(op.home), antes);
  assert.equal(downloads, 1);
});

test('comandos iguais/conflitantes não rodam, mesmo com force; avisos sobrevivem ao JSON', async (t) => {
  for (const situacao of ['igual', 'conflito']) {
    const op = ambiente(t);
    const config = { ...op, terceiros: terceirosFalsos(op, { situacao, avisos: ['aviso preservado'] }) };
    // Somente Impeccable: não há rules ECC a obter; nenhum comando pode criar o arquivo simulado.
    const projeto = path.join(op.raiz, 'projeto');
    fs.mkdirSync(projeto);
    config.detectar = () => ({ ...deteccao(), projeto: { emRepositorio: true, raiz: projeto, stacks: [] } });
    assert.equal(await main(['--clis=nenhum', '--impeccable=codex', '--yes', '--force', '--json'], config), situacao === 'conflito' ? 1 : 0);
    assert.ok(json(op).avisos.includes('aviso preservado'));
    assert.equal(fs.existsSync(path.join(op.home, '.agents/impeccable-simulado')), false);
  }
});

test('CI instala shrinkwrap antes dos testes, smoke usa detectar e actions continuam por SHA', () => {
  const ci = fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const job = ci.slice(ci.indexOf('  instalador:'), ci.indexOf('  segredos:'));
  assert.ok(job.indexOf('npm ci --ignore-scripts') < job.indexOf('npm test'));
  assert.match(job, /node instalador\/cli.mjs detectar/);
  for (const [, ref] of ci.matchAll(/uses:\s+([^\s]+)/g)) assert.match(ref, /@[a-f0-9]{40}$/);
  assert.match(fs.readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^node_modules\/$/m);
});

test('falha na obtenção ECC preserva avisos e não executa comandos nem instala parcialmente o kit', async (t) => {
  const op = ambiente(t);
  let aplicacoes = 0;
  const terceiros = terceirosFalsos(op, { avisos: ['aviso antes do download'] });
  terceiros.obterEcc = () => { throw new Error('download simulado falhou'); };
  assert.equal(await main(['--ecc=claude', '--yes', '--json'], { ...op, terceiros, aplicar: () => { aplicacoes++; } }), 1);
  const resultado = json(op);
  assert.match(resultado.erro, /download simulado falhou/);
  assert.ok(resultado.avisos.includes('aviso antes do download'));
  assert.equal(aplicacoes, 0);
  assert.equal(fs.existsSync(op.home), false);
});

test('plugins desconhecidos bloqueiam ECC com aviso, sem obtenção ou execução mesmo com force', async (t) => {
  const op = ambiente(t);
  const d = deteccao();
  d.plugins.claude = { estado: 'desconhecido', itens: null, erro: 'timeout na consulta' };
  const terceiros = terceirosFalsos(op);
  terceiros.obterEcc = () => assert.fail('ECC não pode ser obtido com plugins desconhecidos');
  const config = { ...op, detectar: () => structuredClone(d), terceiros, planejar: () => [], aplicar: () => assert.fail('Nenhuma ação deve ser aplicada') };
  assert.equal(await main(['--clis=nenhum', '--ecc=claude', '--yes', '--force', '--json'], config), 1);
  const r = json(op);
  assert.equal(r.conflitos.length, 1);
  assert.ok(r.avisos.some((a) => /plugin.*bloqueada/.test(a)));
  assert.equal(fs.existsSync(op.home), false);
});

test('avisos do kit e de terceiros são somados no plano, resumo e relatório final', async (t) => {
  const op = ambiente(t);
  const prepararTerceiros = () => {
    const acoes = [];
    acoes.avisos = ['aviso dos comandos de terceiros'];
    return { acoes, avisos: ['aviso de terceiros'] };
  };
  const planejar = () => {
    const plano = op.planejar();
    plano.avisos = ['Codex: orçamento de 32 KiB exigiu compactação'];
    return plano;
  };
  const esperados = ['aviso de terceiros', 'aviso dos comandos de terceiros', 'Codex: orçamento de 32 KiB exigiu compactação'];
  const plano = await planejarInstalacao(escolhasDasFlags({}, deteccao()), deteccao(), { home: op.home }, { prepararTerceiros, planejar });
  assert.deepEqual(plano.avisos, esperados);
  assert.equal(await main(['--dry-run', '--json'], { ...op, prepararTerceiros, planejar }), 0);
  let r = json(op);
  for (const aviso of esperados) { assert.ok(r.avisos.includes(aviso)); assert.ok(r.resumo.avisos.includes(aviso)); }
  op.stdout.length = 0;
  assert.equal(await main(['--yes', '--json'], { ...op, prepararTerceiros, planejar }), 0);
  r = json(op);
  for (const aviso of esperados) assert.ok(r.avisos.includes(aviso));
});

test('retorno inválido do executor produz erro explícito sem acessar conflitos de undefined', async (t) => {
  for (const retorno of [undefined, {}]) {
    const op = ambiente(t);
    assert.equal(await main(['--yes', '--json'], { ...op, aplicar: async () => retorno }), 1);
    const r = json(op);
    assert.match(r.erro, /relatório válido/);
    assert.doesNotMatch(r.erro, /Cannot read properties/);
    assert.equal(fs.existsSync(op.home), false);
  }
});

test('relatório final mostra aviso Impeccable uma vez no texto e no JSON', async (t) => {
  const aviso = 'Impeccable não oferece desinstalação; confirme manualmente os arquivos criados.';
  for (const modoJson of [false, true]) {
    const op = ambiente(t);
    const config = { ...op,
      prepararTerceiros: () => ({ acoes: [], avisos: [aviso] }),
      aplicar: async () => {
        if (!modoJson) op.out('início do relatório final');
        return { ok: true, acoes: [], conflitos: [], erros: [], avisos: [aviso, { motivo: aviso, dono: 'impeccable' }, { motivo: aviso, dono: 'impeccable' }] };
      },
    };
    assert.equal(await main(['--yes', ...(modoJson ? ['--json'] : [])], config), 0);
    if (modoJson) {
      const r = json(op);
      const avisos = r.avisos.filter((a) => (a.motivo ?? a) === aviso);
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0].dono, 'impeccable');
    } else {
      const fim = op.stdout.slice(op.stdout.indexOf('início do relatório final') + 1);
      assert.equal(fim.filter((s) => s.includes(aviso)).length, 1);
    }
  }
});

test('CLI repassa a escolha de hooks Impeccable desligada ou explicitamente ativada', async (t) => {
  for (const hooks of [false, true]) {
    const op = ambiente(t);
    let recebido;
    assert.equal(await main(['--yes', '--json', '--impeccable=codex', ...(hooks ? ['--impeccable-hooks'] : [])], {
      ...op, prepararTerceiros: (escolhas) => { recebido = escolhas; return { acoes: [] }; },
    }), 0);
    assert.equal(recebido.impeccable.hooks, hooks);
    assert.equal(json(op).escolhas.impeccable.hooks, hooks);
  }
});

test('excesso real do orçamento Codex é relatado antes de executar e preserva a home', async (t) => {
  const op = ambiente(t);
  fs.mkdirSync(path.join(op.home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(op.home, '.codex/AGENTS.md'), 'x'.repeat(40 * 1024));
  const antes = arvore(op.home);
  const { planejar, ...config } = op;
  config.aplicar = () => assert.fail('Excesso de orçamento não pode chegar ao executor');
  assert.equal(await main(['--clis=codex', '--yes', '--json'], config), 1);
  assert.match(json(op).erro, /32 KiB/);
  assert.deepEqual(arvore(op.home), antes);
});

test('saída textual explica ausentes, fora do PATH, erros e stack', () => {
  const d = deteccao();
  d.clis = [{ nome: 'Claude', estado: 'ausente', instalar: 'instalar claude' }, { nome: 'Codex', estado: 'fora-do-path', pasta: '/bin', versao: '1' }, { nome: 'AGY', estado: 'erro', caminho: '/agy', erro: 'falhou' }];
  d.projeto = { emRepositorio: true, raiz: '/repo', stacks: ['python'] };
  const texto = formatarDeteccao(d);
  for (const trecho of ['instalar claude', 'Adicione essa pasta ao PATH', 'falhou', 'python', 'gitleaks']) assert.ok(texto.includes(trecho));
});

test('binário real sem TTY responde help e erro JSON sem hang', () => {
  const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--ecc-stacks/);
  assert.match(help.stdout, /--impeccable-hooks/);
  assert.match(help.stdout, /0 sucesso; 1 quando algo foi pulado, bloqueado ou falhou; 2 erro de uso/);
  const erro = spawnSync(process.execPath, [cli, 'invalido', '--json'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(erro.status, 2);
  assert.equal(JSON.parse(erro.stdout).ok, false);
  assert.equal(erro.stderr, '');
});

test('package e shrinkwrap fixam clack 1.8.1 com integridade nas dependências', () => {
  const pacote = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(new URL('../npm-shrinkwrap.json', import.meta.url), 'utf8'));
  assert.equal(pacote.dependencies['@clack/prompts'], '1.8.1');
  assert.equal(lock.packages[''].dependencies['@clack/prompts'], '1.8.1');
  assert.equal(lock.packages['node_modules/@clack/prompts'].version, '1.8.1');
  for (const [nome, p] of Object.entries(lock.packages)) if (nome) { assert.ok(p.integrity); assert.ok(p.resolved.startsWith('https://registry.npmjs.org/')); }
});
