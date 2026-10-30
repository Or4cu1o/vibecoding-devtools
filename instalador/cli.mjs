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

if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.node.ok && r.git.ok ? 0 : 1);
}

const linhas = [];
linhas.push(`Node ${r.node.versao} ${r.node.ok ? "ok" : `(precisa de ${r.node.minimo} ou maior)`}`);
linhas.push(r.git.ok ? `git ${r.git.versao ?? "?"} ok` : "git ausente");
linhas.push("");
for (const c of r.clis) {
  if (c.estado === "ausente") linhas.push(`${c.nome}: não instalado. Para instalar: ${c.instalar}`);
  else if (c.estado === "fora-do-path") linhas.push(`${c.nome} ${c.versao ?? "?"}: instalado em ${c.pasta}, fora do PATH`);
  else linhas.push(`${c.nome} ${c.versao ?? "?"}: ${c.caminho}`);
}
linhas.push("");
if (r.projeto.emRepositorio) {
  const stacks = r.projeto.stacks.length ? r.projeto.stacks.join(", ") : "nenhuma reconhecida";
  linhas.push(`Projeto: ${r.projeto.raiz}`);
  linhas.push(`Stacks: ${stacks}`);
} else {
  linhas.push("Fora de um repositório git: só o escopo global estará disponível.");
}
console.log(linhas.join("\n"));
process.exit(r.node.ok && r.git.ok ? 0 : 1);
