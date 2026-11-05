#!/usr/bin/env node
// Valida a estrutura do kit: frontmatter de skills e rules, referências a regras e skills, links relativos e CHANGELOG.
// Uso: node scripts/validar-kit.mjs (na raiz do repositório). Sai com código 1 se achar erro.

import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const erros = [];
const erro = (arquivo, msg) => erros.push(`${arquivo}: ${msg}`);

// Skills e regras citadas que vêm de fora do kit (Maestri e as embutidas nas CLIs).
const EXTERNAS = new Set(["maestri", "maestri-manager", "agy-customizations", "review-agent"]);

function listarMd(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === ".git" || e.name === "node_modules") return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listarMd(p);
    return e.name.endsWith(".md") ? [p] : [];
  });
}

function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const campos = {};
  for (const linha of m[1].split("\n")) {
    const c = linha.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (c) campos[c[1]] = c[2];
    else if (/^\S/.test(linha)) campos[`?${linha}`] = "";
  }
  return campos;
}

// Texto sem BOM e com LF, para funcionar também em checkout do Windows (CRLF).
const ler = (p) => fs.readFileSync(p, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
const rel = (p) => path.relative(raiz, p).split(path.sep).join("/");
const existe = (...p) => fs.existsSync(path.join(raiz, ...p));

// Skills: SKILL.md com name igual à pasta e description numa linha.
for (const nome of fs.readdirSync(path.join(raiz, "skills"))) {
  const arquivo = path.join(raiz, "skills", nome, "SKILL.md");
  if (!fs.existsSync(arquivo)) { erro(`skills/${nome}`, "falta SKILL.md"); continue; }
  const fm = frontmatter(ler(arquivo));
  if (!fm) { erro(rel(arquivo), "falta frontmatter"); continue; }
  if (fm.name !== nome) erro(rel(arquivo), `name "${fm.name ?? ""}" difere da pasta "${nome}"`);
  if (!fm.description || /^[|>]/.test(fm.description)) erro(rel(arquivo), "description vazia ou em várias linhas");
  else if (fm.description.length > 1024) erro(rel(arquivo), "description com mais de 1024 caracteres");
  for (const k of Object.keys(fm)) if (k.startsWith("?")) erro(rel(arquivo), `linha de frontmatter inválida: ${k.slice(1)}`);
}

// Rules: no formato do Claude Code, o único campo de frontmatter é paths.
for (const arquivo of listarMd(path.join(raiz, "rules"))) {
  const fm = frontmatter(ler(arquivo));
  for (const k of Object.keys(fm ?? {})) if (k !== "paths") erro(rel(arquivo), `campo de frontmatter não suportado: ${k}`);
}

// Referências e links em todo Markdown.
for (const arquivo of listarMd(raiz)) {
  const texto = ler(arquivo).replace(/^(```|~~~)[\s\S]*?^\1/gm, "");

  // "regra `x`" e "skill `x`" (pt-BR) ou "the `x` skill" e "the `x` rule" (pacote Maestri, em inglês).
  const citadas = [
    ...[...texto.matchAll(/\b(regras?|skills?)\s+`([a-z0-9-]+)`/g)].map(([, tipo, nome]) => [tipo, nome]),
    ...[...texto.matchAll(/`([a-z0-9-]+)`\s+(skill|rule)s?\b/g)].map(([, nome, tipo]) => [tipo, nome]),
  ];
  for (const [tipo, nome] of citadas) {
    const ok = /^(regra|rule)/.test(tipo) ? existe("rules", `${nome}.md`) : existe("skills", nome) || EXTERNAS.has(nome);
    if (!ok) erro(rel(arquivo), `${tipo} \`${nome}\` não existe no kit`);
  }
  for (const [, nome] of texto.matchAll(/(?:superfície\s+`|superficies\/)([a-z0-9-]+)/g)) {
    if (!existe("skills", "revisao-de-seguranca", "superficies", `${nome}.md`)) erro(rel(arquivo), `superfície \`${nome}\` não existe`);
  }
  for (const [, alvo] of texto.replace(/`[^`\n]*`/g, "").matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(alvo)) continue;
    const destino = path.resolve(path.dirname(arquivo), alvo.split("#")[0]);
    if (!fs.existsSync(destino)) erro(rel(arquivo), `link quebrado: ${alvo}`);
  }
}

if (!/^## \[Unreleased\]$/m.test(ler(path.join(raiz, "CHANGELOG.md")))) {
  erro("CHANGELOG.md", "falta a seção ## [Unreleased]");
}

if (erros.length) {
  console.error(erros.join("\n"));
  console.error(`\n${erros.length} erro(s).`);
  process.exit(1);
}
console.log("Kit válido.");
