import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acoesTerceiros, detectarTerceiros, obterEcc, terceiros } from "./terceiros.mjs";

function ambiente(t, { codex = true } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-terceiros-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const caminhos = { home: path.join(temp, "casa"), projeto: path.join(temp, "projeto com espaços") };
  if (codex) fs.mkdirSync(path.join(caminhos.home, ".codex"), { recursive: true });
  return caminhos;
}
const escolhas = (extra = {}) => ({ escopo: "global", ecc: { clis: [] }, impeccable: { clis: [] }, ...extra });
const guardar = (arquivo, valor) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, typeof valor === "string" ? valor : JSON.stringify(valor));
};
const ecc = (clis, hooks = false, escopo = "global") => escolhas({ escopo, ecc: { clis, hooks } });
const detectado = (extra = {}) => ({ plugins: Object.fromEntries(["claude", "codex", "agy"]
  .map((cli) => [cli, { estado: "conhecido", itens: [] }])), ...extra });

test("versões e módulos fixados, sem rules-core nem hooks por padrão", () => {
  assert.equal(terceiros.ecc.versao, "2.2.3");
  assert.equal(terceiros.ecc.tag, "v2.2.3");
  assert.equal(terceiros.ecc.repositorio, "https://github.com/affaan-m/ECC.git");
  assert.equal(terceiros.impeccable.versao, "4.8.0");
  assert.deepEqual(terceiros.ecc.modulos, ["agents-core", "commands-core", "platform-configs", "workflow-quality"]);
});

test("Claude global/projeto, hooks opt-in e inverso mantêm target e cwd; planejar é puro", (t) => {
  const caminhos = ambiente(t, { codex: false });
  for (const escopo of ["global", "projeto"]) for (const hooks of [false, true]) {
    const opcoes = ecc(["claude", "claude"], hooks, escopo);
    const antes = structuredClone(opcoes);
    const acoes = acoesTerceiros(opcoes, detectado({ plataforma: "win32" }), caminhos);
    assert.equal(acoes.length, 1);
    const a = acoes[0];
    const target = escopo === "global" ? "claude" : "claude-project";
    assert.equal(a.tipo, "comando");
    assert.equal(a.dono, "ecc");
    assert.equal(a.cli, "claude");
    assert.equal(a.situacao, "nova");
    assert.equal(a.cmd, "npx.cmd");
    assert.deepEqual(a.args, ["-y", "ecc-universal@2.2.3", "install", "--target", target, "--modules",
      "agents-core,commands-core,platform-configs,workflow-quality" + (hooks ? ",hooks-runtime" : ""),
      hooks ? "--enable-hooks" : "--no-hooks"]);
    assert.deepEqual(a.desinstalar, { cmd: "npx.cmd", args: ["-y", "ecc-universal@2.2.3", "uninstall", "--target", target],
      cwd: caminhos.projeto });
    assert.equal(a.cwd, caminhos.projeto);
    assert.deepEqual(opcoes, antes);
    assert.deepEqual(acoesTerceiros(opcoes, detectado({ plataforma: "win32" }), caminhos), acoes);
  }
  assert.equal(fs.existsSync(caminhos.home), false);
  assert.equal(fs.existsSync(caminhos.projeto), false);
  assert.equal(acoesTerceiros(ecc(["claude"]), { plataforma: "linux" }, caminhos)[0].cmd, "npx");
});

test("Codex usa apenas plugin com marketplace fixado e inverso remove", (t) => {
  const caminhos = ambiente(t);
  const cmd = path.join(caminhos.home, "bin", "codex.cmd");
  const acoes = acoesTerceiros(ecc(["codex"], true), detectado({ clis: [{ id: "codex", caminho: cmd }] }), caminhos);
  assert.deepEqual(acoes.map((a) => a.args), [["plugin", "marketplace", "add", "affaan-m/ECC@v2.2.3"],
    ["plugin", "add", "ecc@ecc"]]);
  assert.ok(acoes.every((a) => a.cmd === cmd));
  const env = { CODEX_HOME: path.join(caminhos.home, ".codex") };
  assert.ok(acoes.every((a) => a.env.CODEX_HOME === env.CODEX_HOME));
  assert.deepEqual(acoes[1].desinstalar, { cmd, args: ["plugin", "remove", "ecc@ecc"], cwd: caminhos.projeto, env });
  assert.match(acoes.avisos.join("\n"), /\/hooks/);
});

test("sem .codex omite todos os comandos Codex com aviso, preservando outros alvos e sem criar pasta", (t) => {
  const caminhos = ambiente(t, { codex: false });
  const aviso = "Abra o Codex uma vez e rode o instalador de novo para instalar o ECC no Codex.";
  for (const escopo of ["global", "projeto"]) for (const plataforma of ["win32", "linux"]) {
    const somenteCodex = acoesTerceiros(ecc(["codex"], true, escopo), detectado({ plataforma }), caminhos);
    assert.equal(somenteCodex.length, 0);
    assert.deepEqual(somenteCodex.avisos, [aviso]);
    const misto = acoesTerceiros(ecc(["claude", "codex"], false, escopo), detectado({ plataforma }), caminhos);
    assert.equal(misto.length, 1);
    assert.equal(misto[0].cli, "claude");
    assert.deepEqual(misto.avisos, [aviso]);
    assert.equal(fs.existsSync(caminhos.home), false);
  }
  fs.mkdirSync(caminhos.home);
  const homeExistente = acoesTerceiros(ecc(["codex"]), detectado(), caminhos);
  assert.equal(homeExistente.length, 0);
  assert.deepEqual(homeExistente.avisos, [aviso]);
  assert.deepEqual(fs.readdirSync(caminhos.home), []);
});

test("Antigravity: global só avisa, projeto nunca habilita hooks", (t) => {
  const caminhos = ambiente(t);
  const global = acoesTerceiros(ecc(["agy"]), {}, caminhos);
  assert.equal(global.length, 0);
  assert.match(global.avisos.join("\n"), /escopo projeto/);
  const local = acoesTerceiros(ecc(["agy"], true, "projeto"), detectado(), caminhos);
  assert.equal(local.length, 1);
  assert.equal(local[0].args[4], "antigravity");
  assert.ok(local[0].args.includes("--no-hooks"));
  assert.ok(!local[0].args.join(" ").includes("hooks-runtime"));
  assert.equal(local[0].cwd, caminhos.projeto);
  assert.equal(local[0].desinstalar.args.at(-1), "antigravity");
  assert.match(local.avisos.join("\n"), /não oferece hooks/);
});

test("Impeccable agrupa providers, usa cwd conforme escopo, -y e telemetria desligada; sem inverso inventado", (t) => {
  const caminhos = ambiente(t);
  for (const escopo of ["global", "projeto"]) for (const hooks of [undefined, false, true]) {
    const acoes = acoesTerceiros(escolhas({ escopo, impeccable: { clis: ["agy", "claude", "codex", "claude"], hooks } }),
      detectado({ plataforma: "win32" }), caminhos);
    assert.equal(acoes.length, 2);
    assert.deepEqual(acoes[0].args, ["-y", "impeccable@4.8.0", "telemetry", "off"]);
    assert.deepEqual(acoes[1].args, ["-y", "impeccable@4.8.0", "install", "--providers=claude,codex,antigravity",
      escopo === "global" ? "--global" : "--project", "-y", ...(hooks === true ? [] : ["--no-hooks"])]);
    for (const a of acoes) {
      assert.equal(a.cmd, "npx.cmd");
      assert.equal(a.cwd, escopo === "global" ? caminhos.home : caminhos.projeto);
      assert.deepEqual(a.env, { DO_NOT_TRACK: "1" });
      assert.equal(a.desinstalar, undefined);
      assert.match(a.aviso, /não oferece desinstalação/);
    }
    assert.match(acoes.avisos.join("\n"), /confirme manualmente/);
  }
});

test("detecção lê apenas estados nas casas e projetos recebidos, inclusive Claude local", (t) => {
  const caminhos = ambiente(t);
  assert.deepEqual(detectarTerceiros(caminhos.home, caminhos.projeto), { ecc: [], avisos: [] });
  guardar(path.join(caminhos.home, ".claude", "ecc", "install-state.json"), { eccVersion: "2.2.3", version: 1 });
  guardar(path.join(caminhos.projeto, ".claude", "ecc", "install-state.json"), { version: "v2.1.0" });
  guardar(path.join(caminhos.projeto, ".agents", "ecc-install-state.json"), { schemaVersion: 2 });
  const detectado = detectarTerceiros(caminhos.home, caminhos.projeto);
  assert.deepEqual(detectado.ecc.map(({ cli, escopo, versao }) => ({ cli, escopo, versao })), [
    { cli: "claude", escopo: "global", versao: "2.2.3" }, { cli: "claude", escopo: "projeto", versao: "2.1.0" },
    { cli: "agy", escopo: "projeto", versao: null },
  ]);
  const plugins = Object.fromEntries(["claude", "agy"].map((cli) => [cli, { estado: "conhecido", itens: [] }]));
  const global = acoesTerceiros(ecc(["claude"]), { plugins, terceiros: detectado }, caminhos);
  assert.equal(global[0].situacao, "igual");
  const local = acoesTerceiros(ecc(["claude", "agy"], false, "projeto"), { instalados: { plugins, terceiros: detectado } }, caminhos);
  assert.deepEqual(local.map((a) => a.situacao), ["atualizar", "igual"]);
  assert.match(local.avisos.join("\n"), /sem versão/);
  assert.equal(detectarTerceiros(caminhos.home).ecc.length, 1);
});

test("install-state corrompido não causa segunda instalação; ausente continua novo", (t) => {
  const caminhos = ambiente(t);
  guardar(path.join(caminhos.home, ".claude", "ecc", "install-state.json"), "{inválido");
  const acoes = acoesTerceiros(ecc(["claude", "codex"]), detectado(), caminhos);
  assert.equal(acoes[0].situacao, "conflito");
  assert.match(acoes.avisos.join("\n"), /Install-state inválido/);
  assert.ok(acoes.slice(1).every((a) => a.situacao === "nova"));
});

test("plugins prontos evitam duplicação por outro método e classificam versão do Codex", (t) => {
  const caminhos = ambiente(t);
  for (const [version, esperado] of [["2.2.3", "igual"], ["2.0.0", "atualizar"], [undefined, "igual"]]) {
    const deteccao = { instalados: { plugins: {
      claude: { estado: "conhecido", itens: [{ name: "ecc@ecc", version: "2.0.0", instalado: true }] },
      codex: { estado: "conhecido", itens: [{ name: "ecc@ecc", version, instalado: true }] },
    } } };
    const acoes = acoesTerceiros(ecc(["claude", "codex"]), deteccao, caminhos);
    assert.deepEqual(acoes.map((a) => a.situacao), ["igual", esperado, esperado]);
    assert.match(acoes.avisos.join("\n"), /método ativo preservado/);
  }
  const npx = acoesTerceiros(ecc(["codex"]), detectado({ terceiros: { ecc: [
    { cli: "codex", escopo: "global", metodo: "npx", versao: "2.0.0" },
  ] } }), caminhos);
  assert.ok(npx.every((a) => a.situacao === "igual"));
  assert.match(npx.avisos.join("\n"), /por npx/);
  assert.equal(acoesTerceiros(ecc(["claude"]), { plugins: { claude: [{ name: "eccentric-tool", instalado: true }] } }, caminhos)[0].situacao, "nova");
});

test("Impeccable não reinstala plugin junto com providers novos", (t) => {
  const acoes = acoesTerceiros(escolhas({ impeccable: { clis: ["claude", "codex"] } }),
    { instalados: { plugins: { claude: { estado: "conhecido", itens: [{ id: "impeccable", instalado: true }] },
      codex: { estado: "conhecido", itens: [] } } } }, ambiente(t));
  const installs = acoes.filter((a) => a.args.includes("install"));
  assert.deepEqual(installs.map((a) => [a.args[3], a.situacao]), [["--providers=claude", "igual"], ["--providers=codex", "nova"]]);
});

test("Impeccable instala só providers sem skill e fica igual mesmo quando o grupo muda", (t) => {
  const caminhos = ambiente(t);
  for (const escopo of ["global", "projeto"]) {
    const raiz = escopo === "global" ? caminhos.home : caminhos.projeto;
    const locais = { claude: ".claude", codex: ".agents", agy: escopo === "global" ? ".gemini/config" : ".agents" };
    const opcoes = escolhas({ escopo, impeccable: { clis: ["claude", "codex", "agy"] } });
    guardar(path.join(raiz, locais.claude, "skills/impeccable/SKILL.md"), "Claude instalado antes");
    if (escopo === "global") guardar(path.join(raiz, locais.agy, "skills/impeccable/SKILL.md"), "Antigravity instalado antes");
    const antes = fs.readFileSync(path.join(raiz, locais.claude, "skills/impeccable/SKILL.md"), "utf8");
    const parcial = acoesTerceiros(opcoes, detectado(), caminhos);
    const installs = parcial.filter((a) => a.args.includes("install"));
    assert.equal(installs.length, 1);
    assert.equal(installs[0].args[3], escopo === "global" ? "--providers=codex" : "--providers=codex,antigravity");
    assert.equal(installs[0].situacao, "nova");
    guardar(path.join(raiz, locais.codex, "skills/impeccable/SKILL.md"), "Restante instalado");
    // No projeto, Codex e Antigravity compartilham .agents/skills.
    const completo = acoesTerceiros(opcoes, detectado(), caminhos);
    assert.equal(completo.length, 2);
    assert.ok(completo.every((a) => a.situacao === "igual"));
    const grupoMenor = acoesTerceiros(escolhas({ escopo, impeccable: { clis: ["claude", "agy"] } }), detectado(), caminhos);
    assert.ok(grupoMenor.every((a) => a.situacao === "igual"));
    assert.equal(fs.readFileSync(path.join(raiz, locais.claude, "skills/impeccable/SKILL.md"), "utf8"), antes);
  }
});

test("presença da skill Impeccable respeita escopo e CLI; diretório sem SKILL.md não conta", (t) => {
  for (const escopo of ["global", "projeto"]) for (const cli of ["claude", "codex", "agy"]) {
    const caminhos = ambiente(t);
    const base = cli === "claude" ? ".claude" : cli === "codex" || escopo === "projeto" ? ".agents" : ".gemini/config";
    const outraRaiz = escopo === "global" ? caminhos.projeto : caminhos.home;
    guardar(path.join(outraRaiz, base, "skills/impeccable/SKILL.md"), "Outro escopo");
    const skill = path.join(escopo === "global" ? caminhos.home : caminhos.projeto, base, "skills/impeccable/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    const opcoes = escolhas({ escopo, impeccable: { clis: [cli] } });
    assert.equal(acoesTerceiros(opcoes, detectado(), caminhos).find((a) => a.args.includes("install")).situacao, "nova");
    guardar(skill, "Instalado");
    // Evidência direta da skill dispensa uma segunda instalação mesmo sem consulta a plugins.
    assert.ok(acoesTerceiros(opcoes, {}, caminhos).every((a) => a.situacao === "igual"));
  }
  const caminhos = ambiente(t);
  guardar(path.join(caminhos.projeto, ".agent/skills/impeccable/SKILL.md"), "Adaptador Impeccable de projeto");
  assert.ok(acoesTerceiros(escolhas({ escopo: "projeto", impeccable: { clis: ["agy"] } }), {}, caminhos)
    .every((a) => a.situacao === "igual"));
});

test("seleção vazia e entradas inválidas falham antes de comandos", (t) => {
  const caminhos = ambiente(t);
  assert.equal(acoesTerceiros(escolhas(), {}, caminhos).length, 0);
  assert.throws(() => acoesTerceiros(escolhas(), {}, {}), /home/);
  assert.throws(() => acoesTerceiros(escolhas({ escopo: "outro" }), {}, caminhos), /Escopo/);
  assert.throws(() => acoesTerceiros(ecc(["claude"], false, "projeto"), {}, { home: caminhos.home }), /projeto/);
  assert.throws(() => acoesTerceiros(ecc(["desconhecido"]), {}, caminhos), /CLI inválida/);
  assert.throws(() => acoesTerceiros(escolhas({ escopo: "projeto", impeccable: { clis: ["claude"] } }), {}, { home: caminhos.home }), /projeto/);
});

test("plugins desconhecidos, ausentes ou malformados bloqueiam instalações com ou sem install-state", (t) => {
  const caminhos = ambiente(t);
  for (const cli of ["claude", "codex", "agy"]) for (const lista of [
    undefined, { estado: "desconhecido", itens: null, erro: "plugin list falhou" },
    { estado: "desconhecido", itens: [] }, { estado: "conhecido", itens: null }, { itens: [] },
  ]) for (const dono of ["ecc", "impeccable"]) for (const comEstado of [false, true]) {
    const opcoes = escolhas({ escopo: "projeto", [dono]: { clis: [cli] } });
    const deteccao = { instalados: { plugins: { [cli]: lista }, terceiros: {
      [dono]: comEstado ? [{ cli, escopo: "projeto", metodo: "npx", versao: "2.0.0" }] : [],
    } } };
    const acoes = acoesTerceiros(opcoes, deteccao, caminhos);
    const installs = acoes.filter((a) => !a.args.includes("telemetry"));
    assert.ok(installs.length > 0);
    assert.ok(installs.every((a) => a.situacao === "conflito"));
    assert.match(acoes.avisos.join("\n"), /Não foi possível confirmar se o (ECC|Impeccable) já está instalado por plugin/);
    assert.equal(deteccao.instalados.plugins[cli], lista);
  }
});

test("só lista conhecida sem o plugin permite nova instalação", (t) => {
  const caminhos = ambiente(t);
  for (const cli of ["claude", "codex", "agy"]) for (const dono of ["ecc", "impeccable"]) {
    const acoes = acoesTerceiros(escolhas({ escopo: "projeto", [dono]: { clis: [cli] } }),
      { instalados: { plugins: { [cli]: { estado: "conhecido", itens: [{ name: "outro-plugin", instalado: true }] } } } }, caminhos);
    assert.ok(acoes.every((a) => a.situacao === "nova"));
    assert.doesNotMatch(acoes.avisos.join("\n"), /Não foi possível confirmar/);
  }
});

test("plugin de catálogo não instalado não bloqueia; só instalado booleano confirma presença ou ausência", (t) => {
  const caminhos = ambiente(t);
  for (const dono of ["ecc", "impeccable"]) for (const cli of ["claude", "codex", "agy"]) {
    for (const [instalado, esperado] of [[false, "nova"], [true, "igual"], [undefined, "conflito"],
      [null, "conflito"], ["false", "conflito"]]) {
      const item = { name: dono === "ecc" ? "ecc@ecc" : "impeccable", instalado,
        status: "not installed", version: terceiros[dono].versao };
      if (instalado === undefined) delete item.instalado;
      const acoes = acoesTerceiros(escolhas({ escopo: "projeto", [dono]: { clis: [cli] } }),
        { instalados: { plugins: { [cli]: { estado: "conhecido", itens: [item] } } } }, caminhos);
      assert.ok(acoes.filter((a) => !a.args.includes("telemetry")).every((a) => a.situacao === esperado));
      if (esperado === "conflito") assert.match(acoes.avisos.join("\n"), /Não foi possível confirmar/);
      else assert.doesNotMatch(acoes.avisos.join("\n"), /Não foi possível confirmar/);
    }
  }
  const legado = acoesTerceiros(ecc(["codex"]), { plugins: { codex: ["ecc@ecc 2.2.3 not installed"] } }, caminhos);
  assert.ok(legado.every((a) => a.situacao === "conflito"));
});

test("CODEX_HOME dos comandos e do inverso vem da home escolhida em qualquer escopo", (t) => {
  const caminhos = ambiente(t);
  for (const escopo of ["global", "projeto"]) for (const plataforma of ["win32", "linux"]) {
    const acoes = acoesTerceiros(ecc(["codex"], false, escopo), detectado({ plataforma }), caminhos);
    const env = { CODEX_HOME: path.join(caminhos.home, ".codex") };
    assert.deepEqual(acoes.map((a) => a.env), [env, env]);
    assert.deepEqual(acoes[1].desinstalar.env, env);
    assert.deepEqual(fs.readdirSync(caminhos.home), [".codex"]);
    assert.deepEqual(fs.readdirSync(path.join(caminhos.home, ".codex")), []);
  }
});

test("Impeccable global sem projeto usa home para telemetry e install, sem criar diretórios", (t) => {
  const { home } = ambiente(t, { codex: false });
  const acoes = acoesTerceiros(escolhas({ impeccable: { clis: ["claude", "codex"] } }), detectado(), { home });
  assert.equal(acoes.length, 2);
  assert.ok(acoes.every((a) => a.cwd === home && a.situacao === "nova"));
  assert.ok(acoes[1].args.includes("--global"));
  assert.equal(fs.existsSync(home), false);
});

test("obterEcc clona só tag fixada para cache isolado e reaproveita tag correta; git é falso", (t) => {
  const { home } = ambiente(t);
  const cache = path.join(home, ".vibecoding-devtools", "cache");
  const destino = path.join(cache, "ecc-2.2.3");
  const chamadas = [];
  const executar = (cmd, args, opcoes) => {
    chamadas.push({ cmd, args, opcoes });
    if (args[0] === "clone") fs.mkdirSync(path.join(destino, "rules"), { recursive: true });
    return { status: 0, stdout: "v2.2.3\n" };
  };
  assert.equal(obterEcc(cache, { executar }), destino);
  assert.equal(chamadas[0].cmd, "git");
  assert.deepEqual(chamadas[0].args, ["clone", "--depth", "1", "--branch", "v2.2.3", "https://github.com/affaan-m/ECC.git", destino]);
  assert.equal(chamadas[0].opcoes.cwd, cache);
  assert.equal(chamadas[0].opcoes.shell, false);
  assert.equal(obterEcc(cache, { executar }), destino);
  assert.deepEqual(chamadas[1].args, ["describe", "--tags", "--exact-match", "HEAD"]);
  assert.throws(() => obterEcc(cache, { executar: () => ({ status: 0, stdout: "v2.0.0" }) }), /Cache ECC inválido/);
});

test("obterEcc propaga erro de clone sem fingir sucesso e não remove cache do usuário", (t) => {
  const { home } = ambiente(t);
  const cache = path.join(home, "cache");
  assert.throws(() => obterEcc(cache, { executar: () => ({ status: 1, stderr: "offline" }) }), /offline/);
  assert.throws(() => obterEcc(cache, { executar: () => ({ error: new Error("sem git") }) }), /sem git/);
  assert.throws(() => obterEcc(null), /cacheDir/);
  assert.equal(fs.existsSync(cache), true);
});
