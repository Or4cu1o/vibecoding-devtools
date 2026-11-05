import { parseArgs } from 'node:util';
import * as clack from '@clack/prompts';

export const CLIS = ['claude', 'codex', 'agy'];
export const STACKS = ['typescript', 'python', 'golang', 'rust', 'java', 'kotlin', 'php', 'ruby', 'swift', 'csharp', 'fsharp', 'dart', 'cpp', 'perl', 'arkts', 'react', 'react-native', 'vue', 'nuxt', 'angular'];
const nomes = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' };
const lista = (valor, permitidos, nome) => {
  const itens = valor === '' || valor === 'nenhum' ? [] : valor.split(',').map((s) => s.trim());
  if (itens.some((s) => !permitidos.includes(s))) throw new Error(`${nome} inválido: ${valor}`);
  return [...new Set(itens)];
};

export function lerFlags(args = []) {
  const booleanas = ['dry-run', 'yes', 'force', 'json', 'maestri', 'ecc-hooks', 'impeccable-hooks', 'projeto', 'help'];
  const strings = ['clis', 'cli', 'escopo', 'ecc', 'ecc-clis', 'ecc-stacks', 'stacks', 'impeccable', 'impeccable-clis'];
  const options = Object.fromEntries([...booleanas.map((k) => [k, { type: 'boolean' }]), ...strings.map((k) => [k, { type: 'string' }])]);
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
  if (positionals.length > 1) throw new Error('Informe apenas um comando');
  const comando = positionals[0] ?? 'instalar';
  if (!['instalar', 'detectar', 'desinstalar', 'uninstall'].includes(comando)) throw new Error(`Comando desconhecido: ${comando}`);
  for (const [a, b] of [['clis', 'cli'], ['ecc', 'ecc-clis'], ['ecc-stacks', 'stacks'], ['impeccable', 'impeccable-clis']]) {
    if (values[a] !== undefined && values[b] !== undefined) throw new Error(`Use apenas --${a} ou --${b}`);
  }
  if (values.projeto && values.escopo && values.escopo !== 'projeto') throw new Error('--projeto conflita com --escopo');
  return { comando: comando === 'uninstall' ? 'desinstalar' : comando, ...values,
    temEscolhas: ['clis', 'cli', 'escopo', 'projeto', 'maestri', 'ecc', 'ecc-clis', 'ecc-hooks', 'ecc-stacks', 'stacks', 'impeccable', 'impeccable-clis', 'impeccable-hooks'].some((k) => values[k] !== undefined) };
}

export function escolhasDasFlags(flags, deteccao) {
  const clis = flags.clis ?? flags.cli;
  const alvos = clis === undefined ? (deteccao.clis ?? []).filter((c) => ['ok', 'fora-do-path'].includes(c.estado)).map((c) => c.id) : lista(clis, CLIS, 'CLI');
  const escopo = flags.projeto ? 'projeto' : flags.escopo ?? 'global';
  if (!['global', 'projeto'].includes(escopo)) throw new Error('Escopo deve ser global ou projeto');
  if (escopo === 'projeto' && (!deteccao.projeto?.emRepositorio || !deteccao.projeto.raiz)) throw new Error('Escopo projeto exige estar dentro de um repositório git');
  const eccClis = lista(flags.ecc ?? flags['ecc-clis'] ?? '', CLIS, 'CLI ECC');
  const impeccableClis = lista(flags.impeccable ?? flags['impeccable-clis'] ?? '', CLIS, 'CLI Impeccable');
  const stacksFlag = flags['ecc-stacks'] ?? flags.stacks;
  const stacks = stacksFlag === undefined ? (escopo === 'projeto' && eccClis.length ? deteccao.projeto.stacks ?? [] : []) : lista(stacksFlag, STACKS, 'Pacote ECC');
  if (flags['ecc-hooks'] && !eccClis.length) throw new Error('--ecc-hooks exige --ecc com CLIs');
  if (flags['impeccable-hooks'] && !impeccableClis.length) throw new Error('--impeccable-hooks exige --impeccable com CLIs');
  if (stacks.length && (!eccClis.length || escopo !== 'projeto')) throw new Error('Pacotes de stack exigem ECC e escopo projeto');
  return { clis: alvos, escopo, ...(escopo === 'projeto' ? { raiz: deteccao.projeto.raiz } : {}), maestri: flags.maestri ?? false,
    ecc: { clis: eccClis, hooks: flags['ecc-hooks'] ?? false, stacks: [...stacks] }, impeccable: { clis: impeccableClis, hooks: flags['impeccable-hooks'] ?? false } };
}

export class Cancelamento extends Error {
  constructor() { super('Operação cancelada'); this.name = 'Cancelamento'; }
}

export async function confirmarExecucao({ prompts = clack } = {}) {
  const resposta = await prompts.confirm({ message: 'Aplicar as ações do resumo?', initialValue: false });
  if (prompts.isCancel(resposta)) throw new Cancelamento();
  return resposta;
}

export async function painel(deteccao, { prompts = clack } = {}) {
  const perguntar = async (tipo, opcoes) => {
    const resposta = await prompts[tipo](opcoes);
    if (prompts.isCancel(resposta)) throw new Cancelamento();
    return resposta;
  };
  const opcoesCli = CLIS.map((value) => ({ value, label: nomes[value], hint: deteccao.clis?.find((c) => c.id === value)?.estado ?? 'ausente' }));
  const padrao = escolhasDasFlags({}, deteccao);
  const clis = await perguntar('multiselect', { message: 'CLIs alvo do kit', options: opcoesCli, initialValues: padrao.clis, required: false });
  const escopo = await perguntar('select', { message: 'Escopo da instalação', initialValue: 'global', options: [
    { value: 'global', label: 'Global' }, ...(deteccao.projeto?.emRepositorio ? [{ value: 'projeto', label: `Projeto: ${deteccao.projeto.raiz}` }] : []),
  ] });
  const maestri = await perguntar('confirm', { message: 'Incluir o pacote Maestri?', initialValue: false });
  const eccClis = await perguntar('multiselect', { message: 'Instalar ECC em quais CLIs?', options: opcoesCli, initialValues: [], required: false });
  let hooks = false;
  let stacks = [];
  if (eccClis.length) {
    hooks = await perguntar('confirm', { message: 'Ativar hooks do ECC (sem suporte no Antigravity)?', initialValue: false });
    if (escopo === 'projeto') stacks = await perguntar('multiselect', { message: 'Pacotes de rules ECC da stack', options: STACKS.map((value) => ({ value, label: value })), initialValues: (deteccao.projeto.stacks ?? []).filter((s) => STACKS.includes(s)), required: false });
  }
  const impeccableClis = await perguntar('multiselect', { message: 'Instalar Impeccable em quais CLIs?', options: opcoesCli, initialValues: [], required: false });
  const impeccableHooks = impeccableClis.length ? await perguntar('confirm', { message: 'Ativar hooks do Impeccable?', initialValue: false }) : false;
  return escolhasDasFlags({ clis: clis.join(','), escopo, maestri, ecc: eccClis.join(','), 'ecc-hooks': hooks, 'ecc-stacks': stacks.join(','), impeccable: impeccableClis.join(','), 'impeccable-hooks': impeccableHooks }, deteccao);
}
