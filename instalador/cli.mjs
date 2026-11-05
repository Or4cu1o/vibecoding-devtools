#!/usr/bin/env node
// Ponto de entrada: npx github:Or4cu1o/vibecoding-devtools#v<versão> [comando] [--json]
// Por enquanto só o comando `detectar` (etapa 1); o painel e a instalação vêm nas próximas etapas.

import { detectarTudo } from "./detectar.mjs";

const args = process.argv.slice(2);
const comando = args.find((a) => !a.startsWith("-")) ?? "detectar";

if (comando !== "detectar") {
  console.error(`Comando desconhecido: ${comando}. Disponível: detectar.`);
  process.exit(2);
}

const r = detectarTudo();
const prontos = r.node.ok && r.git.ok;

if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(prontos ? 0 : 1);
}

const ferramenta = (nome, f, comoInstalar) =>
  f.ok ? `${nome} ${f.versao ?? "?"} ok` : `${nome}: ${f.erro}. Para instalar: ${comoInstalar}`;

const linhas = [];
linhas.push(
  r.node.ok
    ? `Node ${r.node.versao} ok`
    : `Node ${r.node.versao}: precisa de ${r.node.minimo} ou maior. Para instalar: https://nodejs.org`,
);
linhas.push(ferramenta("git", r.git, "https://git-scm.com/downloads"));
linhas.push(ferramenta("gitleaks", r.gitleaks, "https://github.com/gitleaks/gitleaks#installing"));
linhas.push("");
for (const c of r.clis) {
  if (c.estado === "ausente") linhas.push(`${c.nome}: não instalado. Para instalar: ${c.instalar}`);
  else if (c.estado === "erro") linhas.push(`${c.nome}: encontrado em ${c.caminho}, mas não respondeu: ${c.erro}`);
  else if (c.estado === "fora-do-path") {
    linhas.push(`${c.nome} ${c.versao ?? "?"}: instalado em ${c.pasta}, fora do PATH. Adicione essa pasta ao PATH.`);
  } else linhas.push(`${c.nome} ${c.versao ?? "?"}: ${c.caminho}`);
}
linhas.push("");
if (r.projeto.emRepositorio) {
  const stacks = r.projeto.stacks.length ? r.projeto.stacks.join(", ") : "nenhuma reconhecida";
  linhas.push(`Projeto: ${r.projeto.raiz}`);
  linhas.push(`Stacks: ${stacks}`);
} else {
  linhas.push(`Projeto: ${r.projeto.motivo}. Só o escopo global estará disponível.`);
}
console.log(linhas.join("\n"));
process.exit(prontos ? 0 : 1);
