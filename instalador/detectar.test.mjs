import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { acoesTerceiros } from "./terceiros.mjs";
import * as apiTerceiros from "./terceiros.mjs";
import { main } from "./cli.mjs";
import { detectarCli, detectarInstalados, detectarTudo, expandir, extrairVersao, stacksDe, verificarNode,
  procurarEm, verificarFerramenta, analisarPlugins } from "./detectar.mjs";

const WIN = process.platform === "win32";

// Cria um executável falso que imprime a versão e sai com o código dado, no formato de cada plataforma.
function cliFalsa(pasta, bin, saida, codigo = 0) {
  fs.mkdirSync(pasta, { recursive: true });
  const caminho = path.join(pasta, WIN ? `${bin}.cmd` : bin);
  fs.writeFileSync(
    caminho,
    WIN ? `@echo ${saida}\r\n@exit /b ${codigo}\r\n` : `#!/bin/sh\necho "${saida}"\nexit ${codigo}\n`,
  );
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

test("CLI que existe mas falha no --version: erro, não ok", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  cliFalsa(path.join(raiz, "path"), "cli-de-teste", "quebrada", 1);
  const r = detectarCli(CLI, { env: ambiente(raiz, true) });
  assert.equal(r.estado, "erro");
});

test("pasta do PATH entre aspas é lida", (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-"));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  cliFalsa(path.join(raiz, "path"), "cli-de-teste", "cli-de-teste 7.8.9");
  const env = { ...ambiente(raiz, true), PATH: `"${path.join(raiz, "path")}"` };
  assert.equal(detectarCli(CLI, { env }).versao, "7.8.9");
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

function casaInstalada(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-instalados-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test("instalados lê estado e skills homônimas globais e do projeto sem executar CLI ausente", (t) => {
  const home = casaInstalada(t);
  const projeto = path.join(home, "projeto");
  const estado = { versao: "0.0.1", itens: [{ tipo: "copiar", destino: "registrado", dono: "kit" }] };
  fs.mkdirSync(path.join(home, ".vibecoding-devtools"));
  fs.writeFileSync(path.join(home, ".vibecoding-devtools", "estado.json"), JSON.stringify(estado));
  const locais = [
    [home, ".claude", "skills"], [home, ".agents", "skills"], [home, ".gemini", "config", "skills"],
    [projeto, ".claude", "skills"], [projeto, ".agents", "skills"],
  ];
  for (const local of locais) {
    fs.mkdirSync(path.join(...local, "triagem-de-risco"), { recursive: true });
    fs.mkdirSync(path.join(...local, "outra-skill"));
  }
  const resultado = detectarInstalados({ home, projeto, executarPlugins: () => assert.fail("CLI não detectada") });
  assert.deepEqual(resultado.estado, estado);
  assert.equal(resultado.skills.length, 6); // .agents/ do projeto atende duas CLIs.
  assert.ok(resultado.skills.every((s) => s.nome === "triagem-de-risco" && s.caminho.startsWith(home)));
  assert.deepEqual(resultado.skills.filter((s) => s.escopo === "projeto").map((s) => s.cli),
    ["claude", "codex", "agy"]);
  assert.ok(Object.values(resultado.plugins).every((p) => p.estado === "desconhecido" && p.itens === null));
});

test("plugins usam binário detectado, argumentos oficiais, home falso e limites para catálogos grandes", (t) => {
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".claude"));
  fs.mkdirSync(path.join(home, ".codex"));
  const chamadas = [];
  const clis = ["claude", "codex", "agy"].map((id) => ({ id, caminho: path.join(home, `${id}.exe`),
    estado: id === "codex" ? "fora-do-path" : "ok" }));
  const resultado = detectarInstalados({ home, clis, executarPlugins: (cmd, args, opcoes) => {
    chamadas.push({ cmd, args, opcoes });
    return { status: 0, stdout: cmd.endsWith("agy.exe")
      ? '{"plugins":[{"name":"impeccable","version":"4.8.0","installed":true}]}'
      : "ecc@ecc installed, enabled 2.2.3\n" };
  } });
  assert.equal(chamadas.length, 3);
  for (const [i, c] of chamadas.entries()) {
    assert.equal(c.cmd, clis[i].caminho);
    assert.deepEqual(c.args, ["plugin", "list", ...(i === 2 ? ["--json"] : [])]);
    assert.equal(c.opcoes.timeout, 30000);
    assert.equal(c.opcoes.maxBuffer, 64 * 1024 * 1024);
    assert.equal(c.opcoes.cwd, home);
    assert.equal(c.opcoes.env.HOME, home);
    assert.equal(c.opcoes.env.USERPROFILE, home);
    assert.equal(c.opcoes.env.CODEX_HOME, path.join(home, ".codex"));
    assert.equal(c.opcoes.env.CLAUDE_CONFIG_DIR, path.join(home, ".claude"));
  }
  assert.equal(resultado.plugins.agy.itens[0].name, "impeccable");
  assert.match(resultado.plugins.codex.saida, /ecc@ecc/);
  assert.ok(Object.values(resultado.plugins).every((p) => p.estado === "conhecido"));
});

test("tabela Codex acima de 2 MB preserva ECC e Impeccable até o consumidor de terceiros", (t) => {
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".codex"));
  const ecc = "| ecc@ecc | 2.2.3 | installed, enabled |";
  const impeccable = "| impeccable | 4.8.0 | installed, enabled |";
  const linha = "| catalogo-outro-plugin | 1.0.0 | not installed | descrição de outro plugin disponível no catálogo |\n";
  const fim = `${ecc}\n${impeccable}\n`;
  const codigo = `process.stdout.write('Name | Version | Status\\n' + ${JSON.stringify(linha)}.repeat(40000)`
    + ` + ${JSON.stringify(fim)})`;
  const clis = [{ id: "codex", caminho: path.join(home, "codex.exe"), estado: "ok" }];
  let chamadas = 0;
  const instalados = detectarInstalados({ home, clis, executarPlugins: (cmd, args, opcoes) => {
    chamadas++;
    assert.equal(cmd, clis[0].caminho);
    assert.deepEqual(args, ["plugin", "list"]);
    assert.equal(opcoes.timeout, 30000);
    assert.equal(opcoes.maxBuffer, 64 * 1024 * 1024);
    // Processo local de fixture: exercita de verdade o limite de stdout do spawnSync, sem consultar CLI/rede.
    return spawnSync(process.execPath, ["-e", codigo], opcoes);
  } });
  assert.equal(chamadas, 1);
  assert.equal(instalados.plugins.codex.estado, "conhecido");
  assert.ok(Buffer.byteLength(instalados.plugins.codex.saida) > 2 * 1024 * 1024);
  assert.equal(instalados.plugins.codex.itens.find((i) => i.name === "ecc@ecc").instalado, true);
  assert.equal(instalados.plugins.codex.itens.find((i) => i.name === "impeccable").instalado, true);
  assert.equal(instalados.plugins.codex.itens[0].instalado, false);
  const acoes = acoesTerceiros({ escopo: "global", ecc: { clis: ["codex"] },
    impeccable: { clis: ["codex"] } }, { instalados }, { home });
  assert.ok(acoes.filter((a) => a.dono === "ecc").every((a) => a.situacao === "igual"));
  assert.equal(acoes.find((a) => a.dono === "impeccable" && a.args.includes("install")).situacao, "igual");
});

test("Codex lê STATUS real: installed é instalado, not installed só pertence ao catálogo", (t) => {
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".codex"));
  const stdout = "Name Status Version\n"
    + "ecc@ecc installed, enabled 2.2.3\n"
    + "impeccable@openai-curated-remote not installed 4.3.1\n";
  const instalados = detectarInstalados({ home,
    clis: [{ id: "codex", caminho: path.join(home, "codex.exe"), estado: "ok" }],
    executarPlugins: () => ({ status: 0, stdout }) });
  const itens = instalados.plugins.codex.itens;
  assert.equal(instalados.plugins.codex.estado, "conhecido");
  assert.deepEqual(itens.map((i) => [i.name, i.status, i.version, i.instalado]), [
    ["ecc@ecc", "installed, enabled", "2.2.3", true],
    ["impeccable@openai-curated-remote", "not installed", "4.3.1", false],
  ]);
  const acoes = acoesTerceiros({ escopo: "global", ecc: { clis: ["codex"] },
    impeccable: { clis: ["codex"] } }, { instalados }, { home });
  assert.ok(acoes.filter((a) => a.dono === "ecc").every((a) => a.situacao === "igual"));
  assert.equal(acoes.find((a) => a.dono === "impeccable" && a.args.includes("install")).situacao, "nova");
  assert.equal(analisarPlugins("codex", "ecc@ecc enabled 2.2.3")[0].instalado, null);
});

test("Codex lê tabelas reais precedidas por cabeçalhos e caminhos de marketplace", () => {
  const saida = "Marketplace `ecc`\r\n"
    + "C:\\Users\\Teste\\.codex\\.tmp\\marketplaces\\ecc\\.agents\\plugins\\marketplace.json\r\n\r\n"
    + "PLUGIN   STATUS              VERSION  SOURCE\r\n"
    + "ecc@ecc  installed, enabled  2.2.3    C:\\Users\\Teste\\.codex\\.tmp\\marketplaces\\ecc\r\n\r\n"
    + "Marketplace `outro`\r\n"
    + "C:\\Users\\Teste\\.codex\\.tmp\\marketplaces\\outro\\.agents\\plugins\\marketplace.json\r\n\r\n"
    + "PLUGIN   STATUS          VERSION  SOURCE\r\n"
    + "outro@outro  not installed  1.0.0    C:\\Users\\Teste\\.codex\\.tmp\\marketplaces\\outro\r\n";
  assert.deepEqual(analisarPlugins("codex", saida).map(({ name, status, version, instalado }) =>
    [name, status, version, instalado]), [
    ["ecc@ecc", "installed, enabled", "2.2.3", true],
    ["outro@outro", "not installed", "1.0.0", false],
  ]);
});

test("listas vazias reais do Codex e Claude são conhecidas; aviso isolado continua desconhecido", (t) => {
  const codex = "WARNING: The following directories are not on PATH: aliases\nNo marketplace plugins found.";
  const claude = "No plugins installed. Use \x60claude plugin install\x60 to install a plugin.\r\n";
  assert.deepEqual(analisarPlugins("codex", codex), []);
  assert.deepEqual(analisarPlugins("claude", claude), []);
  assert.throws(() => analisarPlugins("codex", "WARNING: alias path notice"), /formato reconhecido/);
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const clis = ["codex", "claude"].map((id) => ({ id, caminho: path.join(home, `${id}.exe`), estado: "ok" }));
  const resultado = detectarInstalados({ home, clis, executarPlugins: (cmd) => ({ status: 0,
    stdout: cmd.endsWith("codex.exe") ? codex : claude }) });
  assert.equal(resultado.plugins.codex.estado, "conhecido");
  assert.deepEqual(resultado.plugins.codex.itens, []);
  assert.equal(resultado.plugins.claude.estado, "conhecido");
  assert.deepEqual(resultado.plugins.claude.itens, []);
});

test("configurações Claude e Codex ausentes são listas vazias sem executar CLIs nem criar pastas", (t) => {
  const home = casaInstalada(t);
  const clis = ["claude", "codex"].map((id) => ({ id, caminho: process.execPath, estado: "ok" }));
  const resultado = detectarInstalados({ home, clis,
    executarPlugins: () => assert.fail("plugin list não deve rodar sem a pasta de configuração") });
  for (const cli of ["claude", "codex"]) {
    assert.deepEqual(resultado.plugins[cli].itens, []);
    assert.equal(resultado.plugins[cli].estado, "conhecido");
    assert.match(resultado.plugins[cli].motivo, /diretório de configuração ausente/);
    assert.equal(fs.existsSync(path.join(home, cli === "codex" ? ".codex" : ".claude")), false);
  }
});

test("instalação completa com as três listas reais vazias libera ECC e Impeccable", async (t) => {
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const projeto = path.join(home, "projeto");
  fs.mkdirSync(projeto);
  const saidas = {
    claude: "No plugins installed. Use \x60claude plugin install\x60 to install a plugin.\r\n",
    codex: "WARNING: The following directories are not on PATH: aliases\nNo marketplace plugins found.",
    agy: '{"plugins":[]}',
  };
  const clis = ["claude", "codex", "agy"].map((id) => ({ id, caminho: process.execPath, estado: "ok" }));
  let consulta = 0;
  let deteccaoFeita;
  const detectar = ({ home: recebida }) => {
    consulta = 0;
    return (deteccaoFeita = {
    node: { ok: true, versao: "22.0.0", minimo: 22 }, git: { ok: true, versao: "2.0.0" },
    gitleaks: { ok: false, erro: "ausente" }, clis,
    projeto: { emRepositorio: true, raiz: projeto, stacks: [] },
    instalados: detectarInstalados({ home: recebida, projeto, clis,
      executarPlugins: () => ({ status: 0, stdout: saidas[["claude", "codex", "agy"][consulta++]] }) }),
    });
  };
  const terceiros = { ...apiTerceiros, obterEcc(cache) {
    const ecc = path.join(cache, "ecc-2.2.3");
    for (const pacote of ["common", "web"]) {
      const pasta = path.join(ecc, "rules", pacote);
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(path.join(pasta, "style.md"), `# ${pacote}\n`);
    }
    return ecc;
  } };
  let aplicadas;
  const stdout = [];
  const args = ["--json", "--projeto", "--clis=nenhum",
    "--ecc=claude,codex,agy", "--impeccable=claude,codex,agy"];
  assert.equal(await main(["--dry-run", ...args], {
    home, cwd: projeto, detectar, terceiros, out: (linha) => stdout.push(linha), err: () => {},
  }), 0);
  const previa = JSON.parse(stdout.at(-1));
  assert.deepEqual(Object.fromEntries(Object.entries(previa.deteccao.instalados.plugins)
    .map(([cli, lista]) => [cli, [lista.estado, lista.itens.length]])), {
    claude: ["conhecido", 0], codex: ["conhecido", 0], agy: ["conhecido", 0],
  });
  assert.equal(previa.resumo.conflitos?.length ?? 0, 0);
  stdout.length = 0;
  const codigo = await main(["--yes", "--json", "--projeto", "--clis=nenhum",
    "--ecc=claude,codex,agy", "--impeccable=claude,codex,agy"], {
    home, cwd: projeto, detectar, terceiros, out: (linha) => stdout.push(linha), err: () => {},
    aplicar: async (acoes) => {
      aplicadas = acoes;
      return { ok: true, dryRun: false, acoes: [], conflitos: [], avisos: [], erros: [] };
    },
  });
  assert.equal(codigo, 0, stdout.join("\n"));
  const relatorio = JSON.parse(stdout.at(-1));
  assert.deepEqual(Object.fromEntries(Object.entries(deteccaoFeita.instalados.plugins)
    .map(([cli, lista]) => [cli, [lista.estado, lista.itens.length]])), {
    claude: ["conhecido", 0], codex: ["conhecido", 0], agy: ["conhecido", 0],
  });
  const terceirosPlanejados = relatorio.resumo.acoes.filter((acao) => ["ecc", "impeccable"].includes(acao.dono));
  assert.ok(terceirosPlanejados.length > 0);
  assert.ok(terceirosPlanejados.every((acao) => acao.situacao === "nova"), JSON.stringify(terceirosPlanejados));
  assert.ok(aplicadas.some((acao) => acao.tipo === "comando" && acao.dono === "ecc"));
  assert.ok(aplicadas.some((acao) => acao.tipo === "comando" && acao.dono === "impeccable"));
  assert.equal(relatorio.conflitos.length, 0);
});

test("Claude lê seção de instalados e Status; JSON de Claude/Antigravity respeita installed e status", () => {
  const claude = analisarPlugins("claude", "Installed plugins:\n"
    + "  ❯ ecc@ecc\n    Version: 2.2.3\n    Scope: user\n    Status: ✔ enabled\n"
    + "  ❯ outro@local\n    Version: 1.0.0\n    Status: disabled\n");
  assert.deepEqual(claude.map((i) => [i.name, i.instalado, i.version]),
    [["ecc@ecc", true, "2.2.3"], ["outro@local", true, "1.0.0"]]);
  for (const cli of ["claude", "agy"]) {
    const itens = analisarPlugins(cli, JSON.stringify({ plugins: [
      { name: "ecc@ecc", installed: true, status: "disabled" },
      { name: "impeccable", installed: false, enabled: true },
      { name: "outro", status: "installed, disabled" },
      { name: "catalogo", status: "not installed" },
      { name: "registro", enabled: false },
      { name: "sem-status" },
    ] }));
    assert.deepEqual(itens.map((i) => i.instalado), [true, false, true, false, true, null]);
  }
});

test("consultas usam CODEX_HOME e CLAUDE_CONFIG_DIR da home falsa, incluindo subprocesso real de fixture", (t) => {
  const home = casaInstalada(t);
  fs.mkdirSync(path.join(home, ".codex"));
  fs.mkdirSync(path.join(home, ".claude"));
  const anteriorCodex = process.env.CODEX_HOME;
  const anteriorClaude = process.env.CLAUDE_CONFIG_DIR;
  process.env.CODEX_HOME = path.join(home, "casa-alheia", ".codex");
  process.env.CLAUDE_CONFIG_DIR = path.join(home, "casa-alheia", ".claude");
  try {
    const codigo = 'const fs=require("node:fs"),p=require("node:path");'
      + 'for(const k of ["CODEX_HOME","CLAUDE_CONFIG_DIR"]){fs.mkdirSync(process.env[k],{recursive:true});'
      + 'fs.writeFileSync(p.join(process.env[k],"fixture.txt"),k)}'
      + 'console.log("ecc@ecc installed, enabled 2.2.3")';
    const resultado = detectarInstalados({ home,
      clis: [{ id: "codex", caminho: path.join(home, "codex.exe"), estado: "ok" }],
      executarPlugins: (_cmd, _args, opcoes) => spawnSync(process.execPath, ["-e", codigo], opcoes) });
    assert.equal(resultado.plugins.codex.estado, "conhecido");
    assert.equal(fs.readFileSync(path.join(home, ".codex", "fixture.txt"), "utf8"), "CODEX_HOME");
    assert.equal(fs.readFileSync(path.join(home, ".claude", "fixture.txt"), "utf8"), "CLAUDE_CONFIG_DIR");
    assert.equal(fs.existsSync(path.join(home, "casa-alheia")), false);
  } finally {
    if (anteriorCodex === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = anteriorCodex;
    if (anteriorClaude === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = anteriorClaude;
  }
});

test("plugins: timeout, falha, exceção, JSON inválido e saída vazia nunca viram ausência", (t) => {
  const home = casaInstalada(t);
  const clis = [{ id: "agy", caminho: path.join(home, "agy.exe"), estado: "erro" }];
  for (const resposta of [
    { status: null, error: new Error("ETIMEDOUT") }, { status: 1, stdout: "[]" },
    { status: 0, stdout: "não é JSON" }, { status: 0, stdout: "{}" }, { status: 0, stdout: "" },
  ]) {
    const plugins = detectarInstalados({ home, clis, executarPlugins: () => resposta }).plugins;
    assert.equal(plugins.agy.estado, "desconhecido");
    assert.equal(plugins.agy.itens, null);
  }
  assert.equal(detectarInstalados({ home, clis, executarPlugins: () => { throw new Error("falha"); } })
    .plugins.agy.estado, "desconhecido");
  assert.deepEqual(detectarInstalados({ home, clis, executarPlugins: () => ({ status: 0, stdout: "[]" }) })
    .plugins.agy.itens, []);
});

test("estado ausente não grava nada e estado inválido não é tratado como instalação vazia", (t) => {
  const home = casaInstalada(t);
  assert.deepEqual(detectarInstalados({ home }).estado.itens, []);
  assert.deepEqual(fs.readdirSync(home), []);
  fs.mkdirSync(path.join(home, ".vibecoding-devtools"));
  fs.writeFileSync(path.join(home, ".vibecoding-devtools", "estado.json"), "quebrado");
  assert.throws(() => detectarInstalados({ home }));
  assert.throws(() => detectarInstalados(), /home/);
});

test("sondagem ignora somente ENOENT/ENOTDIR; EACCES e EIO tornam CLI e ferramenta em erro", (t) => {
  const home = casaInstalada(t);
  for (const code of ["ENOENT", "ENOTDIR", "EACCES", "EIO"]) {
    const mock = t.mock.method(fs, "statSync", () => { throw Object.assign(new Error(code), { code }); });
    const env = { PATH: path.join(home, "bin"), HOME: home };
    const cli = detectarCli(CLI, { env, plataforma: "linux", home });
    const ferramenta = verificarFerramenta("git", { env, plataforma: "linux" });
    if (["ENOENT", "ENOTDIR"].includes(code)) {
      assert.equal(procurarEm("cli", [home], { plataforma: "linux" }), null);
      assert.equal(cli.estado, "ausente");
    } else {
      assert.throws(() => procurarEm("cli", [home], { plataforma: "linux" }), { code });
      assert.equal(cli.estado, "erro");
      assert.equal(cli.instalar, undefined);
      assert.match(cli.erro, new RegExp(code));
      assert.equal(ferramenta.estado, "erro");
    }
    mock.mock.restore();
  }
});

test("home explícita prevalece sobre env na sondagem de detectarTudo", (t) => {
  const home = casaInstalada(t);
  const outra = path.join(home, "outra-casa");
  const consultas = [];
  const mock = t.mock.method(fs, "statSync", (arquivo) => {
    consultas.push(arquivo);
    throw Object.assign(new Error("ausente"), { code: "ENOENT" });
  });
  const resultado = detectarTudo({ home, cwd: home, plataforma: "linux", env: { HOME: outra, PATH: "" },
    executarPlugins: () => assert.fail("Não deve consultar plugins") });
  mock.mock.restore();
  for (const cli of ["claude", "codex", "agy"]) {
    assert.ok(consultas.includes(path.join(home, ".local", "bin", cli)));
  }
  assert.ok(consultas.every((arquivo) => !arquivo.startsWith(outra)));
  assert.ok(resultado.clis.every((cli) => cli.estado === "ausente"));
});

test("home explícita chega ao subprocesso --version e ao caminho USERPROFILE no Windows", (t) => {
  const home = casaInstalada(t);
  const pasta = path.join(home, ".local", "bin");
  const bin = "cli-casa";
  fs.mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, WIN ? `${bin}.cmd` : bin);
  fs.writeFileSync(arquivo, WIN
    ? '@echo 1.2.3\r\n@echo %HOME%> "%HOME%\\home-recebida.txt"\r\n'
    : '#!/bin/sh\necho 1.2.3\nprintf "%s\\n" "$HOME" > "$HOME/home-recebida.txt"\n');
  if (!WIN) fs.chmodSync(arquivo, 0o755);
  const cli = { ...CLI, bin, pastas: { unix: ["~/.local/bin"], win: ["%USERPROFILE%/.local/bin"] } };
  const resultado = detectarCli(cli, { home, env: { HOME: path.join(home, "errada"),
    USERPROFILE: path.join(home, "errada"), PATH: "", PATHEXT: ".CMD" } });
  assert.equal(resultado.estado, "fora-do-path");
  assert.equal(resultado.versao, "1.2.3");
  assert.equal(fs.readFileSync(path.join(home, "home-recebida.txt"), "utf8").trim(), home);
});
