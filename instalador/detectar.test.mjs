import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectarCli, expandir, extrairVersao, stacksDe, verificarNode } from "./detectar.mjs";

const WIN = process.platform === "win32";

// Cria um executável falso que imprime a versão, no formato de cada plataforma.
function cliFalsa(pasta, bin, saida) {
  fs.mkdirSync(pasta, { recursive: true });
  const caminho = path.join(pasta, WIN ? `${bin}.cmd` : bin);
  fs.writeFileSync(caminho, WIN ? `@echo ${saida}\r\n` : `#!/bin/sh\necho "${saida}"\n`);
  if (!WIN) fs.chmodSync(caminho, 0o755);
  return caminho;
}

const CLI = {
  id: "teste",
  nome: "Teste",
  bin: "cli-de-teste",
  pastas: { unix: ["~/fora/bin"], win: ["%LOCALAPPDATA%\\fora\\bin"] },
  instalar: { unix: "instalar-unix", win: "instalar-win" },
};

function ambiente(raiz, comPath) {
  return {
    PATH: comPath ? path.join(raiz, "path") : path.join(raiz, "vazio"),
    PATHEXT: ".EXE;.CMD",
    LOCALAPPDATA: raiz,
    HOME: raiz,
    USERPROFILE: raiz,
  };
}

test("extrai a versão das saídas reais das CLIs", () => {
  assert.equal(extrairVersao("2.1.302 (Claude Code)"), "2.1.302");
  assert.equal(extrairVersao("codex-cli 0.164.0"), "0.164.0");
  assert.equal(extrairVersao("1.4.9"), "1.4.9");
  assert.equal(extrairVersao("sem versão"), null);
});

test("expande ~ e variáveis de ambiente", () => {
  assert.equal(expandir("~/.local/bin", { home: "/h" }), "/h/.local/bin");
  assert.equal(expandir("%LOCALAPPDATA%\\agy\\bin", { env: { LOCALAPPDATA: "C:\\L" } }), "C:\\L\\agy\\bin");
  assert.equal(expandir("%NAO_EXISTE%\\x", { env: {} }), "%NAO_EXISTE%\\x");
});

test("Node abaixo do mínimo é recusado", () => {
  assert.equal(verificarNode("20.11.0").ok, false);
  assert.equal(verificarNode("22.0.0").ok, true);
});

test("CLI no PATH: ok, com caminho e versão", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  cliFalsa(path.join(raiz, "path"), "cli-de-teste", "cli-de-teste 1.2.3");
  const r = detectarCli(CLI, { env: ambiente(raiz, true) });
  assert.equal(r.estado, "ok");
  assert.equal(r.versao, "1.2.3");
});

test("CLI só na pasta conhecida: fora do PATH", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  cliFalsa(path.join(raiz, "fora", "bin"), "cli-de-teste", "cli-de-teste 4.5.6");
  const r = detectarCli(CLI, { env: ambiente(raiz, false) });
  assert.equal(r.estado, "fora-do-path");
  assert.equal(r.versao, "4.5.6");
});

test("CLI ausente: devolve o comando oficial de instalação", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const r = detectarCli(CLI, { env: ambiente(raiz, false) });
  assert.equal(r.estado, "ausente");
  assert.equal(r.instalar, WIN ? "instalar-win" : "instalar-unix");
});

test("stacks pelos arquivos e pelas dependências", () => {
  assert.deepEqual(stacksDe({ arquivos: ["go.mod", "README.md"] }), ["golang"]);
  assert.deepEqual(stacksDe({ arquivos: ["package.json"], dependencias: ["next", "react"] }), ["react", "typescript"]);
  assert.deepEqual(stacksDe({ arquivos: ["pyproject.toml", "App.csproj"] }), ["csharp", "python"]);
  assert.deepEqual(stacksDe({ arquivos: ["notas.txt"] }), []);
});
