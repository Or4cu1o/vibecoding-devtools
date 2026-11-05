import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lerFrontmatter, converterRuleAntigravity, montarBlocoCodex, achatarPacoteEcc, mapaEcc } from "./conversao.mjs";

test("frontmatter: BOM, CRLF, listas, aspas, chaves e corpo preservado", () => {
  const texto = '\uFEFF---\r\npaths:\r\n  - "src/**/*.{ts,tsx}"\r\n  - \'docs/**\'\r\n---\r\n# Corpo\r\n';
  assert.deepEqual(lerFrontmatter(texto), { paths: ["src/**/*.{ts,tsx}", "docs/**"], corpo: "# Corpo\n" });
  assert.deepEqual(lerFrontmatter('---\npaths: ["**/*.ts", \'**/*.tsx\']\n---\nX').paths,
    ["**/*.ts", "**/*.tsx"]);
  assert.deepEqual(lerFrontmatter('---\npaths: "src/**"\n---\nX').paths, ["src/**"]);
  assert.deepEqual(lerFrontmatter("# Sem frontmatter"), { paths: [], corpo: "# Sem frontmatter" });
  assert.deepEqual(lerFrontmatter("---\npaths: []\n---\nX").paths, []);
  assert.throws(() => lerFrontmatter("---\npaths: [x\n---\nX"), /inválida/);
  assert.throws(() => lerFrontmatter("---\npaths: x"), /fechamento/);
});

test("Antigravity sempre recebe trigger e globs entre aspas, mantendo o corpo", () => {
  assert.equal(converterRuleAntigravity("# Rule\n"), "---\ntrigger: always_on\n---\n# Rule\n");
  assert.equal(converterRuleAntigravity('---\npaths: ["**/*.ts", "**/*.tsx"]\n---\nX'),
    '---\ntrigger: glob\nglobs: "**/*.ts, **/*.tsx"\n---\nX');
  assert.match(converterRuleAntigravity("X", ["**/*.py"]), /trigger: glob\nglobs: "\*\*\/\*\.py"/);
});

test("Codex inclui rules ativas e roteia paths e ECC sem incluir corpos sob demanda", () => {
  const bloco = montarBlocoCodex([
    { nome: "base", conteudo: "# Base\nSempre." },
    { nome: "ts", conteudo: '---\npaths: ["**/*.ts"]\n---\nCORPO RESTRITO', destino: "rules/ts.md" },
    { nome: "common", conteudo: "CORPO ECC", destino: "ecc/common.md", dono: "ecc" },
  ]);
  assert.match(bloco, /# Base\nSempre\./);
  assert.match(bloco, /arquivos "\*\*\/\*\.ts".*`rules\/ts.md`/);
  assert.match(bloco, /pacote ECC common.*`ecc\/common.md`/);
  assert.doesNotMatch(bloco, /CORPO RESTRITO|CORPO ECC|paths:/);
  assert.throws(() => montarBlocoCodex([{ nome: "x", conteudo: "X", dono: "ecc" }]), /sem destino/);
});

test("ECC achatado reescreve links, inclusive âncoras, e detecta colisões", () => {
  const arquivos = [{ nome: "style.md", conteudo: "[Base](../common/style.md#base) `../common/testing.md`" }];
  const antes = structuredClone(arquivos);
  const mapa = mapaEcc({ typescript: arquivos, common: [{ nome: "style.md" }, { nome: "testing.md" }] });
  const [rule] = achatarPacoteEcc("typescript", arquivos, { paths: ["**/*.ts"], mapa });
  assert.equal(rule.nome, "ecc-typescript-style.md");
  assert.match(rule.conteudo, /trigger: glob/);
  assert.match(rule.conteudo, /\(ecc-common-style.md#base\)/);
  assert.match(rule.conteudo, /`ecc-common-testing.md`/);
  assert.deepEqual(arquivos, antes);
  assert.throws(() => achatarPacoteEcc("common", [...arquivos, { ...arquivos[0], nome: "STYLE.md" }]), /Colisão/);
  assert.throws(() => achatarPacoteEcc("../fora", arquivos), /inválido/);
});

// Parser mínimo do subconjunto emitido: mapping de escalares simples ou strings JSON (subconjunto de YAML).
function yamlGerado(texto) {
  const cabecalho = texto.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  assert.ok(cabecalho);
  return Object.fromEntries(cabecalho.split("\n").map((linha) => {
    const m = linha.match(/^([a-z_]+): (.+)$/);
    assert.ok(m, `Entrada YAML inválida: ${linha}`);
    if (m[2].startsWith('"')) return [m[1], JSON.parse(m[2])];
    assert.match(m[2], /^[a-z_]+$/);
    return [m[1], m[2]];
  }));
}

test("frontmatter Antigravity é YAML válido: múltiplos globs formam um só escalar", () => {
  const texto = fs.readFileSync(new URL("../rules/contexto-sob-demanda.md", import.meta.url), "utf8");
  const convertido = yamlGerado(converterRuleAntigravity(texto));
  assert.equal(convertido.trigger, "glob");
  assert.equal(convertido.globs, lerFrontmatter(texto).paths.join(", "));
  assert.deepEqual(yamlGerado(converterRuleAntigravity("X")), { trigger: "always_on" });
  assert.throws(() => yamlGerado('---\ntrigger: glob\nglobs: "a", "b"\n---\nX'));
  assert.equal(yamlGerado(converterRuleAntigravity("X", ['a"b', "**/*.{ts,tsx}"])).globs,
    'a"b, **/*.{ts,tsx}');
});

test("mapa ECC resolve links locais e cruzados e torna alvos não instalados em texto", () => {
  const arquivos = [{ nome: "a.md", conteudo: '[Local](./b.md#x) [Comum](../common/c.md?x#z) '
    + '[Ausente](../python/p.md) [Skill](../../skills/e2e/SKILL.md) [Site](https://exemplo.org/a.md)\n'
    + '[Documento][doc] e [Ausente][fora]\n[doc]: ./b.md\n[fora]: ../python/p.md' }];
  const mapa = mapaEcc({ react: [...arquivos, { nome: "b.md" }], common: [{ nome: "c.md" }] });
  const [rule] = achatarPacoteEcc("react", arquivos, { mapa });
  assert.match(rule.conteudo, /\[Local\]\(ecc-react-b.md#x\)/);
  assert.match(rule.conteudo, /\[Comum\]\(ecc-common-c.md\?x#z\)/);
  assert.match(rule.conteudo, /Ausente Skill \[Site\]\(https:/);
  assert.match(rule.conteudo, /\[doc\]: ecc-react-b.md/);
  assert.doesNotMatch(rule.conteudo, /\[fora\]|\[Ausente\]/);
  assert.throws(() => mapaEcc({ "a-b": [{ nome: "c.md" }], a: [{ nome: "b-c.md" }] }), /Colisão/);
});

const eccCache = path.join(process.env.npm_config_cache ?? path.join(os.homedir(),
  ...(process.platform === "win32" ? ["AppData", "Local", "npm-cache"] : [".npm"])),
  "_npx", "75937596e609f96e", "node_modules", "ecc-universal");

test("ECC 2.2.3 real do cache: todos os pacotes selecionados não deixam links .md quebrados",
  { skip: !fs.existsSync(path.join(eccCache, "rules")) && "ECC 2.2.3 não está no cache local" }, () => {
    assert.equal(JSON.parse(fs.readFileSync(path.join(eccCache, "package.json"), "utf8")).version, "2.2.3");
    const nomesPacotes = fs.readdirSync(path.join(eccCache, "rules"), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const pacotes = Object.fromEntries(nomesPacotes.map((pacote) => [pacote,
      fs.readdirSync(path.join(eccCache, "rules", pacote)).filter((n) => n.endsWith(".md"))
        .map((nome) => ({ nome, conteudo: fs.readFileSync(path.join(eccCache, "rules", pacote, nome), "utf8") }))]));
    for (const selecionados of [{ common: pacotes.common }, pacotes, { common: pacotes.common, react: pacotes.react }]) {
      const mapa = mapaEcc(selecionados);
      const convertidas = Object.entries(selecionados).flatMap(([pacote, rules]) => achatarPacoteEcc(pacote, rules, { mapa }));
      const nomes = new Set(convertidas.map((r) => r.nome));
      for (const rule of convertidas) {
        yamlGerado(rule.conteudo);
        for (const [, alvo] of rule.conteudo.matchAll(/\]\(([^\s)]+\.md(?:[?#][^)]*)?)\)/g)) {
          if (/^[a-z]+:|^#/i.test(alvo)) continue;
          assert.ok(nomes.has(alvo.split(/[?#]/)[0]), `${rule.nome} aponta para ${alvo}`);
        }
      }
      const review = convertidas.find((r) => r.nome === "ecc-common-code-review.md");
      assert.match(review.conteudo, /\(ecc-common-testing.md\)/);
      if (selecionados.react) {
        const patterns = convertidas.find((r) => r.nome === "ecc-react-patterns.md");
        assert.match(patterns.conteudo, /\(ecc-react-hooks.md\)/);
        assert.equal(patterns.conteudo.includes("(ecc-typescript-patterns.md)"), Boolean(selecionados.typescript));
        assert.doesNotMatch(convertidas.find((r) => r.nome === "ecc-react-testing.md").conteudo,
          /\[e2e-testing skill\]\(/);
      }
    }
  });

test("converte a rule real de contexto sob demanda do kit", () => {
  const texto = fs.readFileSync(new URL("../rules/contexto-sob-demanda.md", import.meta.url), "utf8");
  assert.ok(lerFrontmatter(texto).paths.includes("**/AGENTS.md"));
  const convertido = converterRuleAntigravity(texto);
  assert.match(convertido, /trigger: glob/);
  assert.match(convertido, /# Contexto sob demanda/);
  assert.doesNotMatch(convertido, /^paths:/m);
});
