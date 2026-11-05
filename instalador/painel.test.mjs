import test from 'node:test';
import assert from 'node:assert/strict';
import { lerFlags, escolhasDasFlags, painel, confirmarExecucao, Cancelamento } from './painel.mjs';

const deteccao = () => ({ clis: [{ id: 'claude', estado: 'ok' }, { id: 'codex', estado: 'fora-do-path' }, { id: 'agy', estado: 'ausente' }], projeto: { emRepositorio: true, raiz: '/repositorio', stacks: ['typescript', 'react'] } });
const escolhas = (args, d = deteccao()) => escolhasDasFlags(lerFlags(args), d);

test('flags têm os mesmos padrões do painel, apenas CLIs detectadas e Maestri opt-in', () => {
  assert.equal(lerFlags([]).comando, 'instalar');
  assert.deepEqual(escolhas([]), { clis: ['claude', 'codex'], escopo: 'global', maestri: false, ecc: { clis: [], hooks: false, stacks: [] }, impeccable: { clis: [], hooks: false } });
  assert.deepEqual(escolhas(['--clis=agy,agy', '--maestri']).clis, ['agy']);
  assert.equal(escolhas(['--maestri']).maestri, true);
  assert.deepEqual(escolhas(['--clis=nenhum']).clis, []);
  assert.equal(lerFlags(['uninstall']).comando, 'desinstalar');
});

test('flags aceitam valores separados ou com igual e seleções de terceiros explícitas', () => {
  const r = escolhas(['--clis', 'codex', '--projeto', '--ecc', 'claude,codex', '--ecc-hooks', '--impeccable=agy', '--yes', '--json', '--dry-run', '--force']);
  assert.deepEqual(r, { clis: ['codex'], escopo: 'projeto', raiz: '/repositorio', maestri: false,
    ecc: { clis: ['claude', 'codex'], hooks: true, stacks: ['typescript', 'react'] }, impeccable: { clis: ['agy'], hooks: false } });
  assert.deepEqual(escolhas(['--escopo=projeto', '--ecc-clis=codex', '--stacks=python']).ecc.stacks, ['python']);
  assert.deepEqual(escolhas(['--escopo=projeto', '--ecc=codex', '--ecc-stacks=']).ecc.stacks, []);
});

test('flags inválidas e escolhas inconsistentes falham sem recorrer ao painel', () => {
  for (const args of [['--foo'], ['instalar', 'detectar'], ['outro'], ['--clis'], ['--clis=codex', '--cli=agy'], ['--projeto', '--escopo=global']]) assert.throws(() => lerFlags(args));
  for (const args of [['--clis=outro'], ['--escopo=outro'], ['--ecc-hooks'], ['--ecc=outro'], ['--impeccable=outro'], ['--ecc-stacks=python'], ['--projeto', '--ecc=codex', '--ecc-stacks=../fora']]) assert.throws(() => escolhas(args));
  assert.throws(() => escolhas(['--projeto'], { clis: [], projeto: { emRepositorio: false } }), /repositório git/);
  assert.deepEqual(escolhas([], { clis: [{ id: 'codex', estado: 'erro' }], projeto: { emRepositorio: false } }).clis, []);
});

function promptsFalsos(respostas) {
  const chamadas = [];
  const prompts = { isCancel: (r) => typeof r === 'symbol' };
  for (const tipo of ['multiselect', 'select', 'confirm']) prompts[tipo] = async (opcoes) => { chamadas.push({ tipo, ...opcoes }); return respostas.shift(); };
  return { prompts, chamadas };
}

test('painel pergunta na ordem, sugere detecção e retorna contrato equivalente às flags', async () => {
  const fake = promptsFalsos([['codex'], 'projeto', true, ['claude'], false, ['typescript'], ['agy'], false]);
  const r = await painel(deteccao(), fake);
  assert.deepEqual(r, escolhas(['--clis=codex', '--projeto', '--maestri', '--ecc=claude', '--ecc-stacks=typescript', '--impeccable=agy']));
  assert.deepEqual(fake.chamadas.map((c) => c.tipo), ['multiselect', 'select', 'confirm', 'multiselect', 'confirm', 'multiselect', 'multiselect', 'confirm']);
  assert.deepEqual(fake.chamadas[0].initialValues, ['claude', 'codex']);
  assert.equal(fake.chamadas[1].initialValue, 'global');
  assert.equal(fake.chamadas[4].initialValue, false);
  assert.deepEqual(fake.chamadas[5].initialValues, ['typescript', 'react']);
  assert.equal(fake.chamadas[7].initialValue, false);
});

test('painel fora de git só oferece global e pula perguntas ECC não selecionado', async () => {
  const fake = promptsFalsos([['codex'], 'global', false, [], []]);
  const r = await painel({ clis: [], projeto: { emRepositorio: false } }, fake);
  assert.deepEqual(fake.chamadas[1].options.map((o) => o.value), ['global']);
  assert.equal(fake.chamadas.length, 5);
  assert.equal(r.ecc.hooks, false);
  assert.equal(r.impeccable.hooks, false);
});

test('hooks Impeccable são opt-in no painel e nas flags e exigem CLI selecionada', async () => {
  assert.equal(escolhas(['--impeccable=codex']).impeccable.hooks, false);
  const flags = ['--clis=codex', '--impeccable=codex', '--impeccable-hooks'];
  assert.equal(escolhas(flags).impeccable.hooks, true);
  assert.equal(lerFlags(['--impeccable-hooks']).temEscolhas, true);
  assert.throws(() => escolhas(['--impeccable-hooks']), /exige --impeccable/);
  const fake = promptsFalsos([['codex'], 'global', false, [], ['codex'], true]);
  assert.deepEqual(await painel(deteccao(), fake), escolhas(flags));
  assert.equal(fake.chamadas.at(-1).initialValue, false);
});

test('cancelamento interrompe painel e confirmação; confirmar tem padrão negativo', async () => {
  const fake = promptsFalsos([Symbol('cancel')]);
  await assert.rejects(painel(deteccao(), fake), Cancelamento);
  assert.equal(fake.chamadas.length, 1);
  await assert.rejects(confirmarExecucao(promptsFalsos([Symbol('cancel')])), Cancelamento);
  const confirm = promptsFalsos([false]);
  assert.equal(await confirmarExecucao(confirm), false);
  assert.equal(confirm.chamadas[0].initialValue, false);
});
