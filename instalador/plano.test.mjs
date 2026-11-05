import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { montarPlano } from "./plano.mjs";
import { hashConteudo } from "./estado.mjs";

const kit = fileURLToPath(new URL("../", import.meta.url));
function ambiente(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "vbd-plano-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const caminhos = { home: path.join(temp, "casa"), projeto: path.join(temp, "projeto"), kit,
    ecc: path.join(temp, "ecc") };
  for (const pacote of ["common", "web", "typescript"]) {
    const pasta = path.join(caminhos.ecc, "rules", pacote);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, "style.md"), `# ${pacote}\n[Comum](../common/style.md)\n`);
  }
  return caminhos;
}
const escolhas = (extra = {}) => ({ clis: ["claude", "codex", "agy"], escopo: "global", maestri: false,
  ecc: { clis: [], hooks: false, stacks: [] }, impeccable: { clis: [] }, ...extra });
const destino = (acao) => acao.destino.replace(/\\/g, "/");

test("kit global real nas três CLIs: destinos, conteúdo, metadados e ausência de escrita", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas();
  const antes = structuredClone(opcoes);
  const plano = montarPlano(opcoes, {}, caminhos);
  assert.deepEqual(montarPlano(opcoes, {}, caminhos), plano);
  assert.deepEqual(opcoes, antes);
  assert.equal(fs.existsSync(caminhos.home), false);
  assert.equal(fs.existsSync(caminhos.projeto), false);
  for (const acao of plano) {
    assert.deepEqual(Object.keys(acao).sort(),
      ["tipo", "dono", "cli", "origem", "destino", "conteudo", "descricao", "situacao"].sort());
    assert.equal(acao.situacao, "nova");
    assert.ok(["copiar", "escrever", "bloco"].includes(acao.tipo));
    assert.ok(acao.destino.startsWith(caminhos.home + path.sep));
    if (acao.origem) assert.ok(fs.existsSync(acao.origem));
    assert.doesNotMatch(acao.descricao, /maestri/i);
  }
  assert.ok(plano.some((a) => destino(a).endsWith("/.claude/rules/vibecoding/base.md")));
  assert.ok(plano.some((a) => destino(a).endsWith("/.agents/skills/revisao-de-seguranca")));
  assert.ok(plano.some((a) => destino(a).endsWith("/.gemini/config/skills/triagem-de-risco")));
  const bloco = plano.find((a) => a.tipo === "bloco");
  assert.match(bloco.conteudo, /# Base/);
  assert.match(bloco.conteudo, /contexto-sob-demanda.md/);
  assert.doesNotMatch(bloco.conteudo, /# Contexto sob demanda/);
  assert.ok(Buffer.byteLength(bloco.conteudo) < 32 * 1024);
});

test("Maestri é opt-in em rules e skills nas três CLIs", (t) => {
  const plano = montarPlano(escolhas({ maestri: true }), {}, ambiente(t));
  for (const cli of ["claude", "codex", "agy"]) {
    assert.equal(plano.filter((a) => a.cli === cli && a.descricao.startsWith("Skill")
      && /maestri-/.test(a.destino)).length, 3);
    assert.ok(plano.some((a) => a.cli === cli && /maestri-protocolo|# Protocolo Maestri/
      .test(a.destino + a.conteudo)));
  }
});

test("ECC global: common+web só Claude, common nas demais; stack não entra global", (t) => {
  const caminhos = ambiente(t);
  const plano = montarPlano(escolhas({ clis: [], ecc: {
    clis: ["claude", "codex", "agy"], hooks: true, stacks: ["typescript"],
  } }), {}, caminhos);
  assert.equal(plano.filter((a) => a.cli === "claude" && a.dono === "ecc").length, 2);
  assert.ok(plano.some((a) => destino(a).endsWith("/.codex/vibecoding/ecc/common")));
  assert.ok(plano.some((a) => destino(a).endsWith("/ecc-common-style.md")
    && a.conteudo.includes("trigger: always_on")));
  assert.equal(plano.some((a) => /typescript/.test(a.destino + a.conteudo)), false);
  const bloco = plano.find((a) => a.tipo === "bloco");
  assert.match(bloco.conteudo, /common\/style.md/);
  assert.doesNotMatch(bloco.conteudo, /# common/);
});

test("projeto: modelos únicos, skills compartilhadas, stacks e links preservados/reescritos", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ escopo: "projeto", ecc: {
    clis: ["claude", "codex", "agy"], hooks: false, stacks: ["typescript", "typescript"],
  } });
  const plano = montarPlano(opcoes, {}, caminhos);
  assert.equal(plano.filter((a) => a.descricao === "Modelo de projeto AGENTS.md").length, 1);
  assert.equal(plano.filter((a) => a.descricao === "Modelo de projeto CLAUDE.md").length, 1);
  assert.equal(plano.filter((a) => destino(a).endsWith("/.agents/skills/triagem-de-risco")).length, 1);
  assert.ok(plano.some((a) => destino(a).endsWith("/.claude/rules/ecc/typescript") && a.tipo === "copiar"));
  const agy = plano.find((a) => destino(a).endsWith("/.agents/rules/ecc-typescript-style.md"));
  assert.match(agy.conteudo, /trigger: glob/);
  assert.match(agy.conteudo, /ecc-common-style.md/);
  assert.doesNotMatch(agy.conteudo, /\.\.\/common/);
  assert.match(plano.find((a) => a.tipo === "bloco").conteudo, /stack typescript/);
  assert.equal(new Set(plano.map((a) => `${a.tipo}:${a.destino}`)).size, plano.length);
  assert.ok(plano.every((a) => a.destino.startsWith(caminhos.projeto + path.sep)));
  assert.equal(fs.existsSync(caminhos.projeto), false);
});

test("seleções explícitas prevalecem sobre detecção e terceiros não geram comandos", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["codex", "codex"], impeccable: { clis: ["claude"] } });
  const plano = montarPlano(opcoes, { clis: [], projeto: { stacks: ["python"] } }, caminhos);
  assert.ok(plano.every((a) => a.cli === "codex" && a.dono === "kit"));
  assert.deepEqual(montarPlano(escolhas({ clis: [] }), {}, caminhos), []);
});

test("entradas incompletas, traversal e pacotes sem globs falham antes da execução", (t) => {
  const caminhos = ambiente(t);
  assert.throws(() => montarPlano(escolhas({ escopo: "projeto" }), {}, { ...caminhos, projeto: null }), /projeto/);
  assert.throws(() => montarPlano(escolhas({ clis: ["invalida"] }), {}, caminhos), /CLI inválida/);
  assert.throws(() => montarPlano(escolhas({ ecc: { clis: ["agy"] } }), {}, { ...caminhos, ecc: null }), /baixado/);
  assert.throws(() => montarPlano(escolhas({ escopo: "projeto", ecc: {
    clis: ["codex"], stacks: ["../fora"],
  } }), {}, caminhos), /Pacote ECC inválido/);
  const pasta = path.join(caminhos.ecc, "rules", "nova-stack");
  fs.mkdirSync(pasta);
  fs.writeFileSync(path.join(pasta, "rule.md"), "# Rule");
  assert.throws(() => montarPlano(escolhas({ escopo: "projeto", ecc: {
    clis: ["agy"], stacks: ["nova-stack"],
  } }), {}, caminhos), /sem globs conhecidos/);
});

function guardar(destino, conteudo) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, conteudo);
}

test("classifica arquivo novo, idêntico, atualização registrada e conflito local sem gravar", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["agy"] });
  const alvo = montarPlano(opcoes, {}, caminhos).find((a) => a.destino.endsWith("vibecoding-base.md"));
  assert.equal(alvo.situacao, "nova");
  const situacao = (deteccao = {}) => montarPlano(opcoes, deteccao, caminhos)
    .find((a) => a.destino === alvo.destino).situacao;
  guardar(alvo.destino, alvo.conteudo);
  assert.equal(situacao(), "igual"); // Mesmo conteúdo, mesmo se instalado por outra fonte.
  guardar(alvo.destino, "versão antiga");
  assert.equal(situacao(), "conflito");
  const estado = { versao: "0.0.1", itens: [{ tipo: "escrever", dono: "kit", destino: alvo.destino,
    hash: hashConteudo("versão antiga") }] };
  const deteccao = { instalados: { estado } };
  assert.equal(situacao(deteccao), "atualizar");
  guardar(path.join(caminhos.home, ".vibecoding-devtools", "estado.json"), JSON.stringify(estado));
  assert.equal(situacao(), "atualizar"); // Compatibilidade com quem ainda não passa detecção.
  guardar(alvo.destino, "edição local");
  assert.equal(situacao(deteccao), "conflito");
  assert.equal(fs.readFileSync(alvo.destino, "utf8"), "edição local");
});

test("cópia de árvore verifica bytes dos arquivos, registros individuais e conflitos parciais", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["claude"] });
  const alvo = montarPlano(opcoes, {}, caminhos).find((a) => a.descricao === "Skill do kit: revisao-de-seguranca");
  fs.cpSync(alvo.origem, alvo.destino, { recursive: true });
  const situacao = (itens = []) => montarPlano(opcoes, { instalados: { estado: { itens } } }, caminhos)
    .find((a) => a.destino === alvo.destino).situacao;
  assert.equal(situacao(), "igual");
  const arquivo = path.join(alvo.destino, "superficies", "dinheiro.md");
  guardar(arquivo, "antigo");
  assert.equal(situacao(), "conflito");
  const itens = [{ tipo: "copiar", dono: "kit", destino: arquivo, hash: hashConteudo("antigo") }];
  assert.equal(situacao(itens), "atualizar");
  guardar(path.join(alvo.destino, "usuario.txt"), "preservar");
  assert.equal(situacao(itens), "conflito");
  assert.equal(fs.readFileSync(arquivo, "utf8"), "antigo");
});

test("bloco compara só trecho marcado, preserva contexto externo e respeita hash registrado", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["codex"] });
  const alvo = montarPlano(opcoes, {}, caminhos).find((a) => a.tipo === "bloco");
  const marcar = (conteudo) => `<!-- vibecoding-devtools:inicio -->\n${conteudo}\n<!-- vibecoding-devtools:fim -->`;
  const situacao = (itens = []) => montarPlano(opcoes, { instalados: { estado: { itens } } }, caminhos)
    .find((a) => a.tipo === "bloco").situacao;
  guardar(alvo.destino, "# Instruções do usuário\n");
  assert.equal(situacao(), "nova");
  guardar(alvo.destino, `Antes\n${marcar(alvo.conteudo)}\nDepois`);
  assert.equal(situacao(), "igual");
  guardar(alvo.destino, `Antes\n${marcar("anterior")}\nDepois`);
  assert.equal(situacao(), "conflito");
  const itens = [{ tipo: "bloco", dono: "kit", destino: alvo.destino, hash: hashConteudo(marcar("anterior")) }];
  assert.equal(situacao(itens), "atualizar");
  guardar(alvo.destino, `Antes\n${marcar("alterado localmente")}\nDepois`);
  assert.equal(situacao(itens), "conflito");
  guardar(alvo.destino, "<!-- vibecoding-devtools:inicio -->\nsem fim");
  assert.equal(situacao(itens), "conflito");
});

test("modelo AGENTS continua igual após receber bloco Codex e ECC registrado também atualiza", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ escopo: "projeto", clis: ["codex"], ecc: { clis: ["codex"], stacks: [] } });
  const plano = montarPlano(opcoes, {}, caminhos);
  const modelo = plano.find((a) => a.descricao === "Modelo de projeto AGENTS.md");
  const bloco = plano.find((a) => a.tipo === "bloco");
  guardar(modelo.destino, fs.readFileSync(modelo.origem, "utf8")
    + `<!-- vibecoding-devtools:inicio -->\n${bloco.conteudo}\n<!-- vibecoding-devtools:fim -->`);
  const ecc = plano.find((a) => a.dono === "ecc");
  guardar(path.join(ecc.destino, "style.md"), "ECC anterior");
  const itens = [{ tipo: "copiar", dono: "ecc", destino: path.join(ecc.destino, "style.md"),
    hash: hashConteudo("ECC anterior") }];
  const atualizado = montarPlano(opcoes, { instalados: { estado: { itens } } }, caminhos);
  assert.equal(atualizado.find((a) => a.destino === modelo.destino && a.tipo === "copiar").situacao, "igual");
  assert.equal(atualizado.find((a) => a.tipo === "bloco").situacao, "igual");
  assert.equal(atualizado.find((a) => a.destino === ecc.destino).situacao, "atualizar");
});

test("roteamento ECC ausente gera atualização única e bloco Codex permanece igual depois", (t) => {
  const caminhos = ambiente(t);
  const antigo = escolhas({ clis: ["codex"], maestri: true });
  const novo = escolhas({ clis: ["codex"], maestri: true,
    ecc: { clis: ["codex"], hooks: false, stacks: [] } });
  const anterior = montarPlano(antigo, {}, caminhos).find((a) => a.tipo === "bloco");
  const marcador = (conteudo) => `<!-- vibecoding-devtools:inicio -->\n${conteudo}\n<!-- vibecoding-devtools:fim -->`;
  guardar(anterior.destino, marcador(anterior.conteudo));
  const item = { tipo: "bloco", dono: "kit", destino: anterior.destino, hash: hashConteudo(marcador(anterior.conteudo)) };
  const comEcc = montarPlano(novo, { instalados: { estado: { itens: [item] } } }, caminhos)
    .find((a) => a.tipo === "bloco");
  assert.equal(comEcc.situacao, "atualizar");
  assert.doesNotMatch(anterior.conteudo, /vibecoding\/ecc\/common/);
  assert.match(comEcc.conteudo, /vibecoding\/ecc\/common/);

  guardar(comEcc.destino, marcador(comEcc.conteudo));
  item.hash = hashConteudo(marcador(comEcc.conteudo));
  const repetido = montarPlano(novo, { instalados: { estado: { itens: [item] } } }, caminhos)
    .find((a) => a.tipo === "bloco");
  assert.equal(repetido.situacao, "igual");
  assert.equal(repetido.conteudo, comEcc.conteudo);
});

test("destino com tipo incompatível ou ancestral que é arquivo fica como conflito", (t) => {
  const caminhos = ambiente(t);
  guardar(path.join(caminhos.home, ".claude"), "arquivo do usuário");
  const plano = montarPlano(escolhas({ clis: ["claude"] }), {}, caminhos);
  assert.ok(plano.every((a) => a.situacao === "conflito"));
  assert.equal(fs.readFileSync(path.join(caminhos.home, ".claude"), "utf8"), "arquivo do usuário");
  const agy = montarPlano(escolhas({ clis: ["agy"] }), {}, caminhos)
    .find((a) => a.tipo === "escrever");
  fs.mkdirSync(agy.destino, { recursive: true });
  assert.equal(montarPlano(escolhas({ clis: ["agy"] }), {}, caminhos)
    .find((a) => a.destino === agy.destino).situacao, "conflito");
});

const marcarCodex = (conteudo) => `<!-- vibecoding-devtools:inicio -->\n${conteudo}\n<!-- vibecoding-devtools:fim -->`;

test("orçamento Codex agrega global/projeto e reduz ECC para uma linha por pacote com aviso", (t) => {
  const caminhos = ambiente(t);
  for (let i = 0; i < 35; i++) guardar(path.join(caminhos.ecc, "rules", "common", `regra-${i}.md`), "# ECC");
  const opcoes = escolhas({ clis: ["codex"], escopo: "projeto", ecc: { clis: ["codex"], stacks: [] } });
  const normal = montarPlano(opcoes, {}, caminhos).find((a) => a.tipo === "bloco");
  const global = "á".repeat(1000); // Orçamento em bytes, não em caracteres.
  guardar(path.join(caminhos.home, ".codex", "AGENTS.md"), global);
  const bytesSemProjeto = Buffer.byteLength(global) + Buffer.byteLength(marcarCodex(normal.conteudo));
  const projeto = "P".repeat(32768 - bytesSemProjeto - 1 + 16); // separador antes do novo bloco = 1 byte.
  guardar(path.join(caminhos.projeto, "AGENTS.md"), projeto);
  const plano = montarPlano(opcoes, {}, caminhos);
  assert.equal(plano.avisos.length, 1);
  assert.match(plano.avisos[0], /32784 bytes.*32 KiB.*linha por pacote/);
  const bloco = plano.find((a) => a.tipo === "bloco");
  assert.equal((bloco.conteudo.match(/pacote ECC common/g) ?? []).length, 1);
  assert.doesNotMatch(bloco.conteudo, /common\/regra-/);
  const soma = Buffer.byteLength(global + projeto + "\n" + marcarCodex(bloco.conteudo));
  assert.ok(soma <= 32768);
  assert.equal(fs.readFileSync(path.join(caminhos.projeto, "AGENTS.md"), "utf8"), projeto);
});

test("orçamento Codex inclui marcadores, aceita exatamente 32 KiB e recusa excesso após compactação", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["codex"] });
  const bloco = montarPlano(opcoes, {}, caminhos).find((a) => a.tipo === "bloco");
  const novo = marcarCodex(bloco.conteudo);
  const projeto = "P".repeat(1000);
  guardar(path.join(caminhos.projeto, "AGENTS.md"), projeto);
  const prefixo = "G".repeat(32768 - Buffer.byteLength(novo) - projeto.length - 1) + "\n";
  const global = path.join(caminhos.home, ".codex", "AGENTS.md");
  guardar(global, prefixo + marcarCodex("antigo"));
  assert.equal(montarPlano(opcoes, {}, caminhos).avisos, undefined);
  guardar(path.join(caminhos.projeto, "AGENTS.md"), projeto + "é");
  assert.throws(() => montarPlano(opcoes, {}, caminhos), /32770 bytes.*32768 bytes/);
  assert.equal(fs.readFileSync(global, "utf8"), prefixo + marcarCodex("antigo"));
});

test("orçamento Codex considera o modelo ainda não copiado e substitui o bloco antigo", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["codex"], escopo: "projeto" });
  const bloco = montarPlano(opcoes, {}, caminhos).find((a) => a.tipo === "bloco");
  const global = path.join(caminhos.home, ".codex", "AGENTS.md");
  guardar(global, "G".repeat(32768 - Buffer.byteLength(marcarCodex(bloco.conteudo)) - 100));
  assert.throws(() => montarPlano(opcoes, {}, caminhos), /reduza os AGENTS.md/);
  guardar(global, "Global\n");
  guardar(path.join(caminhos.projeto, "AGENTS.md"), "Projeto\n" + marcarCodex("x".repeat(40000)));
  assert.doesNotThrow(() => montarPlano(opcoes, {}, caminhos));
});

test("orçamento Codex considera o tamanho do modelo que será atualizado antes do bloco", (t) => {
  const caminhos = ambiente(t);
  const opcoes = escolhas({ clis: ["codex"], escopo: "projeto" });
  const bloco = montarPlano(opcoes, {}, caminhos).find((a) => a.tipo === "bloco");
  const agents = path.join(caminhos.projeto, "AGENTS.md");
  const base = "modelo antigo\n";
  const antigo = marcarCodex("bloco antigo");
  guardar(agents, base + antigo);
  guardar(path.join(caminhos.home, ".codex", "AGENTS.md"),
    "G".repeat(32768 - Buffer.byteLength(marcarCodex(bloco.conteudo)) - 500));
  const estado = { itens: [
    { tipo: "copiar", destino: agents, hash: hashConteudo(base) },
    { tipo: "bloco", destino: agents, hash: hashConteudo(antigo), separador: "" },
  ] };
  assert.throws(() => montarPlano(opcoes, { instalados: { estado } }, caminhos), /32768 bytes/);
});

test("plano Antigravity usa mapa de todos os pacotes selecionados e remove links não instalados", (t) => {
  const caminhos = ambiente(t);
  guardar(path.join(caminhos.ecc, "rules", "typescript", "style.md"),
    "[Comum](../common/style.md) [Local](./outro.md) [Ausente](../python/testing.md)");
  guardar(path.join(caminhos.ecc, "rules", "typescript", "outro.md"), "# Outra");
  const plano = montarPlano(escolhas({ clis: [], escopo: "projeto", ecc: {
    clis: ["agy"], stacks: ["typescript"],
  } }), {}, caminhos);
  const rule = plano.find((a) => a.destino.endsWith("ecc-typescript-style.md"));
  assert.match(rule.conteudo, /\[Comum\]\(ecc-common-style.md\)/);
  assert.match(rule.conteudo, /\[Local\]\(ecc-typescript-outro.md\)/);
  assert.doesNotMatch(rule.conteudo, /\[Ausente\]\(/);
  for (const [, nome] of rule.conteudo.matchAll(/\]\(([^)]+\.md)\)/g)) {
    assert.ok(plano.some((a) => path.basename(a.destino) === nome));
  }
});
