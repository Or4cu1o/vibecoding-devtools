#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarTudo } from './detectar.mjs';
import { montarPlano } from './plano.mjs';
import { executar, desinstalar, INICIO, FIM } from './executar.mjs';
import { lerEstado, hashConteudo } from './estado.mjs';
import { lerFlags, escolhasDasFlags, painel, confirmarExecucao, Cancelamento } from './painel.mjs';
import * as apiTerceiros from './terceiros.mjs';

export const AJUDA = `Uso: vibecoding-devtools [instalar|detectar|desinstalar|uninstall] [flags]
Sem comando: instalar. Sem TTY: use --yes para aplicar ou --dry-run para conferir.
--clis claude,codex,agy        CLIs do kit (padrão: detectadas; vazio ou nenhum: nenhuma)
--escopo global|projeto       Global por padrão; projeto exige repositório git
--projeto                    Atalho para --escopo projeto
--maestri                    Incluir rules e skills Maestri
--ecc claude,codex,agy        CLIs do ECC (padrão: nenhuma)
--ecc-hooks                  Ativar hooks do ECC (padrão: desligados)
--ecc-stacks typescript,python  Pacotes ECC do projeto (padrão: stacks detectadas)
--impeccable claude,codex,agy  CLIs do Impeccable (padrão: nenhuma)
--impeccable-hooks           Ativar hooks do Impeccable (padrão: desligados)
--dry-run  --yes  --force  --json  --help
Sem cache, o resumo das rules ECC é exibido sem download; o ECC só é obtido após confirmar.
Códigos de saída: 0 sucesso; 1 quando algo foi pulado, bloqueado ou falhou; 2 erro de uso.`;

export function formatarDeteccao(r) {
  const ferramenta = (nome, f, url) => f.ok ? `${nome} ${f.versao ?? '?'} ok` : `${nome}: ${f.erro}. Para instalar: ${url}`;
  const linhas = [r.node.ok ? `Node ${r.node.versao} ok` : `Node ${r.node.versao}: precisa de ${r.node.minimo} ou maior. Para instalar: https://nodejs.org`,
    ferramenta('git', r.git, 'https://git-scm.com/downloads'), ferramenta('gitleaks', r.gitleaks, 'https://github.com/gitleaks/gitleaks#installing')];
  for (const c of r.clis) {
    if (c.estado === 'ausente') linhas.push(`${c.nome}: não instalado. Para instalar: ${c.instalar}`);
    else if (c.estado === 'erro') linhas.push(`${c.nome}: encontrado em ${c.caminho}, mas não respondeu: ${c.erro}`);
    else if (c.estado === 'fora-do-path') linhas.push(`${c.nome} ${c.versao ?? '?'}: instalado em ${c.pasta}, fora do PATH. Adicione essa pasta ao PATH.`);
    else linhas.push(`${c.nome} ${c.versao ?? '?'}: ${c.caminho}`);
  }
  linhas.push(r.projeto.emRepositorio ? `Projeto: ${r.projeto.raiz}\nStacks: ${(r.projeto.stacks ?? []).join(', ') || 'nenhuma reconhecida'}` : `Projeto: ${r.projeto.motivo}. Só o escopo global estará disponível.`);
  return linhas.join('\n');
}

/** Somente leitura: o executor valida caminhos e expande pastas em arquivos individuais. */
export function resumirPlano(plano, { home, force = false } = {}) {
  // O plano já reconhece modelos AGENTS com blocos e instalações idênticas de outra fonte.
  // Iguais só são listados: não devem passar ao executor, que protege arquivos não registrados.
  const iguais = [];
  const listarIgual = (acao) => {
    if (acao.tipo === 'copiar' && fs.lstatSync(acao.origem).isDirectory()) {
      iguais.push({ ...acao, pasta: true });
      for (const nome of fs.readdirSync(acao.origem).sort()) listarIgual({ ...acao, origem: path.join(acao.origem, nome), destino: path.join(acao.destino, nome) });
    } else iguais.push(acao);
  };
  for (const acao of plano.filter((a) => a.situacao === 'igual')) listarIgual(acao);
  // --force permite substituir arquivos; nunca força um comando de terceiro em conflito.
  const conflitos = plano.filter((a) => a.situacao === 'conflito' && (!force || a.tipo === 'comando'));
  const adiadas = plano.filter((a) => a.tipo === 'resumo');
  const previa = executar(plano.filter((a) => a.tipo !== 'resumo' && a.situacao !== 'igual' && (a.situacao !== 'conflito' || (force && a.tipo !== 'comando'))), { home, dryRun: true, force });
  const estado = lerEstado({ home });
  const acoes = previa.acoes.map((acao) => {
    if (acao.status === 'igual') return { ...acao, situacao: 'igual' };
    if (acao.tipo === 'comando') {
      const igual = estado.itens.some((i) => i.tipo === 'comando' && i.cmd === acao.cmd && JSON.stringify(i.args) === JSON.stringify(acao.args) && i.cwd === (acao.cwd ?? home) && i.cli === acao.cli && i.dono === acao.dono && JSON.stringify(i.env) === JSON.stringify(acao.env));
      return { ...acao, situacao: acao.situacao === 'atualizar' ? 'atualizar' : igual ? 'igual' : acao.situacao ?? 'nova' };
    }
    const st = fs.existsSync(acao.destino) ? fs.lstatSync(acao.destino) : null;
    if (st?.isDirectory()) return { ...acao, situacao: 'igual', pasta: true };
    if (acao.tipo === 'copiar' && fs.lstatSync(acao.origem).isDirectory()) return { ...acao, situacao: 'nova', pasta: true };
    let atual = st ? fs.readFileSync(acao.destino) : null;
    let desejado;
    if (acao.tipo === 'bloco') {
      const texto = atual?.toString('utf8') ?? '';
      const inicio = texto.indexOf(INICIO);
      const fim = texto.indexOf(FIM, inicio);
      atual = inicio < 0 ? null : texto.slice(inicio, fim + FIM.length);
      desejado = `${INICIO}\n${acao.conteudo}\n${FIM}`;
    } else desejado = acao.tipo === 'copiar' ? fs.readFileSync(acao.origem) : acao.conteudo;
    const registrado = estado.itens.some((i) => i.destino === acao.destino && i.tipo === acao.tipo);
    return { ...acao, situacao: atual === null ? 'nova' : registrado && hashConteudo(atual) === hashConteudo(desejado) ? 'igual' : 'atualizar' };
  });
  acoes.push(...iguais, ...adiadas);
  for (const conflito of [...conflitos, ...previa.conflitos]) acoes.push({ ...conflito, situacao: 'conflito' });
  return { acoes, erros: previa.erros, ok: previa.erros.length === 0, avisos: [...(plano.avisos ?? []), ...previa.avisos] };
}

/** Somente leitura: a obtenção/validação do ECC é adiada até depois da confirmação. */
export function prepararTerceiros(escolhas, deteccao, caminhos, { terceiros = apiTerceiros } = {}) {
  const instalados = terceiros.detectarTerceiros(caminhos.home, caminhos.projeto);
  const acoes = terceiros.acoesTerceiros(escolhas, { ...deteccao, terceiros: instalados }, caminhos);
  // Install-state corrompido não autoriza alterar nem os comandos nem as rules daquela CLI.
  const eccClis = escolhas.ecc.clis.filter((cli) => !acoes.some((a) => a.dono === 'ecc' && a.cli === cli && a.situacao === 'conflito'));
  const cache = path.join(caminhos.home, '.vibecoding-devtools', 'cache');
  const ecc = caminhos.ecc ?? path.join(cache, `ecc-${apiTerceiros.terceiros.ecc.versao}`);
  const disponivel = fs.existsSync(path.join(ecc, 'rules'));
  return { acoes, avisos: [...new Set([...(instalados.avisos ?? []), ...(acoes.avisos ?? [])])],
    caminhos: disponivel ? { ecc } : {}, cache, obterDepois: eccClis.length > 0,
    rulesPendentes: eccClis.length > 0 && !disponivel,
    escolhas: { ...escolhas, ecc: { ...escolhas.ecc, clis: eccClis } } };
}

export async function planejarInstalacao(escolhas, deteccao, caminhos, { prepararTerceiros: preparar, planejar = montarPlano, terceiros = apiTerceiros } = {}) {
  const preparados = preparar ? await preparar(escolhas, deteccao, caminhos) : prepararTerceiros(escolhas, deteccao, caminhos, { terceiros });
  let selecao = preparados.escolhas ?? escolhas;
  if (preparados.rulesPendentes) selecao = { ...selecao, ecc: { ...selecao.ecc, clis: [] } };
  const planoKit = planejar(selecao, deteccao, { ...caminhos, ...preparados.caminhos });
  const plano = [...preparados.acoes, ...planoKit];
  if (preparados.rulesPendentes) {
    plano.push({ tipo: 'resumo', dono: 'ecc', cli: preparados.escolhas.ecc.clis.join(','), situacao: 'nova',
      descricao: `Baixar o ECC v${apiTerceiros.terceiros.ecc.versao} e copiar as rules nas CLIs selecionadas (arquivos disponíveis após o download)` });
  }
  plano.avisos = [...new Set([...(preparados.avisos ?? []), ...(preparados.acoes.avisos ?? []), ...(planoKit.avisos ?? [])])];
  plano.preparacao = preparados;
  return plano;
}

const formatarAcao = (a) => a.tipo === 'comando' ? JSON.stringify([a.cmd, ...a.args]) : a.destino ?? a.descricao;
const avisosUnicos = (avisos) => {
  const unicos = new Map();
  for (const aviso of avisos) {
    const chave = typeof aviso === 'string' ? aviso : aviso.motivo ?? JSON.stringify(aviso);
    // Conserva os detalhes do item quando o mesmo aviso chegou também como texto do plano.
    if (!unicos.has(chave) || typeof unicos.get(chave) === 'string') unicos.set(chave, aviso);
  }
  return [...unicos.values()];
};
const imprimirResumo = (resumo, out) => {
  out('Resumo:');
  for (const a of resumo.acoes) out(`[${a.situacao ?? a.status}] ${a.tipo} ${formatarAcao(a)}${a.motivo ? ` — ${a.motivo}` : ''}`);
  for (const e of resumo.erros) out(`Erro: ${e.mensagem}`);
  for (const a of resumo.avisos ?? []) out(`Aviso: ${a.motivo ?? a}`);
};

/** Retorna código de saída; injeções permitem testes sem TTY e com home falso. */
export async function main(argv = process.argv.slice(2), opcoes = {}) {
  const { home = os.homedir(), cwd = process.cwd(), kit = fileURLToPath(new URL('../', import.meta.url)),
    isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY), out = console.log, err = console.error,
    detectar = detectarTudo, escolher = painel, confirmar = confirmarExecucao, prepararTerceiros: preparar, terceiros = apiTerceiros,
    planejar = montarPlano, aplicar = executar, remover = desinstalar } = opcoes;
  let flags;
  let avisos = [];
  let codigoErro = 2;
  const emitir = (objeto) => out(JSON.stringify(objeto, null, 2));
  try {
    flags = lerFlags(argv);
    if (flags.help) { out(AJUDA); return 0; }
    codigoErro = 1;
    if (flags.comando === 'desinstalar') {
      const pastas = new Set();
      for (const item of lerEstado({ home }).itens) if (item.destino) {
        for (let p = path.dirname(item.destino); p !== path.dirname(p) && p !== path.resolve(home); p = path.dirname(p)) {
          if (path.relative(home, p).startsWith('..')) break;
          pastas.add(p);
        }
      }
      const previa = remover({ home, dryRun: true });
      if (!flags.json) imprimirResumo(previa, out);
      if (flags['dry-run'] || !previa.ok) { if (flags.json) emitir(previa); return previa.ok ? 0 : 1; }
      if (!flags.yes) {
        if (!isTTY || flags.json) throw new Error('Use --yes para desinstalar sem interação ou --dry-run para conferir');
        if (!await confirmar()) throw new Cancelamento();
      }
      const resultado = remover({ home, dryRun: false });
      const metadados = path.join(home, '.vibecoding-devtools');
      if (fs.existsSync(metadados)) resultado.avisos.push({ destino: metadados, motivo: `Metadados de instalação e cache mantidos em ${metadados}` });
      for (const pasta of pastas) if (fs.existsSync(pasta) && fs.lstatSync(pasta).isDirectory() && fs.readdirSync(pasta).length === 0) {
        resultado.avisos.push({ destino: pasta, motivo: `Pasta vazia mantida: ${pasta}` });
      }
      if (flags.json) emitir(resultado);
      else imprimirResumo(resultado, out);
      return resultado.ok ? 0 : 1;
    }
    const deteccao = await detectar({ cwd, home, env: { ...process.env, HOME: home, USERPROFILE: home } });
    if (flags.comando === 'detectar') {
      if (flags.json) emitir(deteccao); else out(formatarDeteccao(deteccao));
      return deteccao.node.ok && deteccao.git.ok ? 0 : 1;
    }
    if (!flags.json) out(formatarDeteccao(deteccao));
    if (!deteccao.node.ok || !deteccao.git.ok) throw new Error(`Pré-requisitos ausentes: ${!deteccao.node.ok ? 'Node >=22 (https://nodejs.org) ' : ''}${!deteccao.git.ok ? 'git (https://git-scm.com/downloads)' : ''}`);
    if (!isTTY && !flags.yes && !flags['dry-run']) throw new Error('Sem TTY: use --yes para aplicar ou --dry-run para conferir');
    const escolhas = isTTY && !flags.temEscolhas && !flags.yes && !flags['dry-run'] && !flags.json ? await escolher(deteccao) : escolhasDasFlags(flags, deteccao);
    if (!escolhas.clis.length && !escolhas.ecc.clis.length && !escolhas.impeccable.clis.length) throw new Error('Nenhuma CLI selecionada; use --clis claude,codex,agy');
    // detectarTudo já inclui estado, skills homônimas e plugins; conserva o contrato do detector.
    deteccao.instalados ??= { estado: lerEstado({ home }), skills: [], plugins: {} };
    const caminhos = { home, kit, projeto: escolhas.raiz ?? deteccao.projeto.raiz };
    const prepararPlano = () => planejarInstalacao(escolhas, deteccao, caminhos, { prepararTerceiros: preparar, planejar, terceiros });
    let plano = await prepararPlano();
    let resumo = resumirPlano(plano, { home, force: flags.force });
    avisos = [...resumo.avisos, ...(!deteccao.gitleaks.ok ? ['gitleaks recomendado, mas ausente ou indisponível; instale: https://github.com/gitleaks/gitleaks#installing'] : [])];
    if (!flags.json) imprimirResumo(resumo, out);
    if (flags['dry-run'] || !resumo.ok) {
      if (flags.json) emitir({ ok: resumo.ok, dryRun: true, deteccao, escolhas, resumo, avisos });
      return resumo.ok ? 0 : 1;
    }
    if (!flags.yes) {
      if (!isTTY || flags.json) throw new Error('Use --yes para aplicar sem interação ou --dry-run para conferir');
      if (!await confirmar()) throw new Cancelamento();
    }
    if (plano.preparacao.obterDepois && resumo.acoes.some((a) => a.dono === 'ecc' && !['igual', 'conflito'].includes(a.situacao))) {
      caminhos.ecc = await terceiros.obterEcc(plano.preparacao.cache);
      plano = await prepararPlano();
      resumo = resumirPlano(plano, { home, force: flags.force });
      avisos = [...new Set([...avisos, ...resumo.avisos])];
      if (!flags.json) imprimirResumo(resumo, out);
      if (!resumo.ok || plano.preparacao.rulesPendentes) throw new Error('Não foi possível preparar as rules ECC após obter o cache');
    }
    // Pastas não vazias já foram expandidas: recopiá-las reescreveria itens iguais ou em conflito.
    const pendentes = resumo.acoes.filter((a) => a.tipo !== 'resumo' && a.situacao !== 'igual' && a.situacao !== 'conflito'
      && (!a.pasta || fs.readdirSync(a.origem).length === 0));
    const resultado = pendentes.length
      ? await aplicar(pendentes, { home, force: flags.force ?? false, dryRun: false })
      : { ok: true, dryRun: false, acoes: [], conflitos: [], avisos: [], erros: [] };
    if (!resultado || typeof resultado.ok !== 'boolean'
      || ['acoes', 'conflitos', 'avisos', 'erros'].some((campo) => !Array.isArray(resultado[campo]))) {
      throw new Error('Executor de instalação não devolveu um relatório válido');
    }
    resultado.conflitos.push(...resumo.acoes.filter((a) => a.situacao === 'conflito'));
    resultado.ok &&= resultado.conflitos.length === 0;
    const avisosFinais = avisosUnicos([...avisos, ...resultado.avisos]);
    if (flags.json) emitir({ ...resultado, escolhas, resumo, avisos: avisosFinais });
    else {
      for (const aviso of avisosFinais) out(`Aviso: ${aviso.motivo ?? aviso}`);
      for (const e of resultado.erros) err(`Erro: ${e.mensagem}`);
      out(`Aplicadas: ${resultado.acoes.length}; iguais: ${resumo.acoes.filter((a) => a.situacao === 'igual').length}; conflitos: ${resultado.conflitos.length}.`);
    }
    return resultado.ok ? 0 : 1;
  } catch (e) {
    const cancelado = e instanceof Cancelamento;
    if (flags?.json || argv.includes('--json')) emitir({ ok: false, ...(cancelado ? { cancelado: true } : {}), erro: e.message, avisos });
    else { for (const aviso of avisos) out(`Aviso: ${aviso}`); err(e.message); }
    return cancelado ? 0 : codigoErro;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
