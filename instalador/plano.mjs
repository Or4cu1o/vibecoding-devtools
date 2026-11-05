// Montagem somente de leitura: nenhuma gravação, rede, execução ou consulta à casa real do usuário.
import fs from "node:fs";
import path from "node:path";
import { isUtf8 } from "node:buffer";
import { lerEstado, hashConteudo } from "./estado.mjs";
import { achatarPacoteEcc, converterRuleAntigravity, lerFrontmatter, montarBlocoCodex, mapaEcc } from "./conversao.mjs";

const CLIS = ["claude", "codex", "agy"];
const STACK_GLOBS = {
  typescript: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  python: ["**/*.py"], golang: ["**/*.go"], rust: ["**/*.rs"], java: ["**/*.java"],
  kotlin: ["**/*.kt", "**/*.kts"], php: ["**/*.php"], ruby: ["**/*.rb"], swift: ["**/*.swift"],
  csharp: ["**/*.cs"], fsharp: ["**/*.fs", "**/*.fsx"], dart: ["**/*.dart"],
  cpp: ["**/*.c", "**/*.cpp", "**/*.h", "**/*.hpp"], perl: ["**/*.pl", "**/*.pm"],
  arkts: ["**/*.ets"], react: ["**/*.jsx", "**/*.tsx"], "react-native": ["**/*.jsx", "**/*.tsx"],
  vue: ["**/*.vue"], nuxt: ["**/*.vue", "nuxt.config.*"], angular: ["**/*.ts", "**/*.html"],
};
const lista = (itens = []) => [...new Set(itens)].sort();
const entradas = (pasta) => fs.readdirSync(pasta, { withFileTypes: true }).sort((a, b) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const lerRules = (pasta) => entradas(pasta).filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => ({ nome: e.name, origem: path.join(pasta, e.name),
    conteudo: fs.readFileSync(path.join(pasta, e.name), "utf8") }));

const INICIO = "<!-- vibecoding-devtools:inicio -->";
const FIM = "<!-- vibecoding-devtools:fim -->";
const stat = (arquivo) => {
  try { return fs.lstatSync(arquivo); }
  catch (erro) { if (["ENOENT", "ENOTDIR"].includes(erro.code)) return null; throw erro; }
};
const mesmoCaminho = (a, b) => typeof a === "string" && path.resolve(a) === path.resolve(b);

function extrairBloco(texto) {
  const inicio = texto.indexOf(INICIO);
  const fim = texto.indexOf(FIM);
  if (inicio < 0 && fim < 0) return null;
  if (inicio < 0 || fim < inicio || texto.indexOf(INICIO, inicio + INICIO.length) >= 0
    || texto.indexOf(FIM, fim + FIM.length) >= 0) return { invalido: true };
  return { conteudo: texto.slice(inicio, fim + FIM.length), inicio, fim: fim + FIM.length };
}

// Mede os arquivos completos resultantes, incluindo marcadores, separador e conteúdo externo preservado.
function bytesCodex(acoes, home, projeto, itens) {
  const arquivos = new Set([path.join(home, ".codex", "AGENTS.md")]);
  if (projeto) arquivos.add(path.join(projeto, "AGENTS.md"));
  let bytes = 0;
  for (const arquivo of arquivos) {
    const copia = acoes.find((a) => a.tipo === "copiar" && mesmoCaminho(a.destino, arquivo));
    let texto = stat(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
    if (copia && ["nova", "atualizar"].includes(situacaoDe(copia, itens))) {
      const anterior = extrairBloco(texto);
      const registro = itens.find((i) => i.tipo === "bloco" && mesmoCaminho(i.destino, arquivo));
      texto = fs.readFileSync(copia.origem, "utf8");
      if (anterior && !anterior.invalido && registro && hashConteudo(anterior.conteudo) === registro.hash) {
        texto += (registro.separador ?? "") + anterior.conteudo;
      }
    }
    const acao = acoes.find((a) => a.tipo === "bloco" && mesmoCaminho(a.destino, arquivo));
    if (acao) {
      const bloco = extrairBloco(texto);
      const novo = `${INICIO}\n${acao.conteudo}\n${FIM}`;
      texto = bloco && !bloco.invalido ? texto.slice(0, bloco.inicio) + novo + texto.slice(bloco.fim)
        : texto + (texto && !texto.endsWith("\n") ? "\n" : "") + novo;
    }
    bytes += Buffer.byteLength(texto);
  }
  return bytes;
}

function situacaoDe(acao, itens) {
  // Links nos destinos (inclusive pais) são conflitos, como no executor; nunca seguem para fora da árvore.
  for (let p = path.resolve(acao.destino); ; p = path.dirname(p)) {
    const ancestral = stat(p);
    if (ancestral?.isSymbolicLink()
      || (p !== path.resolve(acao.destino) && ancestral && !ancestral.isDirectory())) return "conflito";
    if (p === path.dirname(p)) break;
  }
  const st = stat(acao.destino);
  if (!st) return "nova";
  if (acao.tipo === "copiar" && fs.lstatSync(acao.origem).isDirectory()) {
    if (!st.isDirectory()) return "conflito";
    const nomes = entradas(acao.origem).map((e) => e.name);
    // Conteúdo extra não é apagado pela cópia; impede declarar a árvore toda como igual.
    if (entradas(acao.destino).some((e) => !nomes.includes(e.name))) return "conflito";
    const situacoes = nomes.map((nome) => situacaoDe({ ...acao,
      origem: path.join(acao.origem, nome), destino: path.join(acao.destino, nome) }, itens));
    return ["conflito", "atualizar", "nova"].find((s) => situacoes.includes(s)) ?? "igual";
  }
  if (!st.isFile()) return "conflito";
  const atual = fs.readFileSync(acao.destino);
  let anterior = itens.find((item) => item.tipo === acao.tipo && mesmoCaminho(item.destino, acao.destino));
  if (anterior?.pendente && anterior.hashAntes === hashConteudo(atual)) anterior = anterior.anterior;
  if (acao.tipo === "bloco") {
    if (!isUtf8(atual)) return "conflito";
    const bloco = extrairBloco(atual.toString("utf8"));
    if (!bloco) return "nova"; // Acrescentar um bloco preserva o conteúdo externo de AGENTS.md.
    if (bloco.invalido) return "conflito";
    const novo = `${INICIO}\n${acao.conteudo}\n${FIM}`;
    if (bloco.conteudo === novo) return "igual";
    return anterior?.tipo === "bloco" && anterior.hash === hashConteudo(bloco.conteudo)
      ? "atualizar" : "conflito";
  }
  const esperado = acao.tipo === "copiar" ? fs.readFileSync(acao.origem) : Buffer.from(acao.conteudo);
  if (atual.equals(esperado)) return "igual";
  // Um modelo do projeto pode ter recebido o bloco Codex após a cópia inicial.
  let base = atual;
  if (acao.descricao === "Modelo de projeto AGENTS.md") {
    const texto = atual.toString("utf8");
    const bloco = extrairBloco(texto);
    if (bloco && !bloco.invalido) {
      const registro = itens.find((i) => i.tipo === "bloco" && mesmoCaminho(i.destino, acao.destino));
      let inicio = bloco.inicio;
      if (registro?.separador && texto.slice(inicio - registro.separador.length, inicio) === registro.separador) {
        inicio -= registro.separador.length;
      }
      const semBloco = Buffer.from(texto.slice(0, inicio) + texto.slice(bloco.fim));
      if (semBloco.equals(esperado)) return "igual";
      if (registro && hashConteudo(bloco.conteudo) === registro.hash) base = semBloco;
    }
  }
  return anterior && !anterior.pendente && anterior.hash === hashConteudo(base)
    ? "atualizar" : "conflito";
}

export function montarPlano(escolhas, deteccao, caminhos) {
  const { home, kit, ecc, projeto } = caminhos;
  if (!home || !kit) throw new Error("caminhos.home e caminhos.kit são obrigatórios");
  const estado = deteccao?.instalados?.estado ?? lerEstado({ home });
  if (!["global", "projeto"].includes(escolhas.escopo)) throw new Error("Escopo inválido");
  const local = escolhas.escopo === "projeto";
  if (local && !projeto) throw new Error("Escopo projeto exige caminhos.projeto");
  const kitClis = lista(escolhas.clis);
  const eccClis = lista(escolhas.ecc?.clis);
  const clis = lista([...kitClis, ...eccClis]);
  if (clis.some((cli) => !CLIS.includes(cli))) throw new Error("CLI inválida");
  if (eccClis.length && !ecc) throw new Error("ECC selecionado exige caminhos.ecc já baixado");
  const raiz = local ? projeto : home;
  const acoes = [];
  const avisos = [];
  const destinos = new Map();
  const adicionar = (tipo, dono, cli, origem, destino, conteudo, descricao) => {
    const acao = { tipo, dono, cli, origem, destino, conteudo, descricao };
    const chave = `${tipo}:${destino.toLowerCase()}`;
    if (destinos.has(chave)) {
      const anterior = destinos.get(chave);
      if (anterior.origem !== origem || anterior.conteudo !== conteudo) {
        throw new Error(`Colisão de destino: ${destino}`);
      }
      return;
    }
    destinos.set(chave, acao);
    acoes.push(acao);
  };
  if (local && clis.length) {
    for (const nome of ["AGENTS.md", ...(clis.includes("claude") ? ["CLAUDE.md"] : [])]) {
      adicionar("copiar", "kit", nome === "CLAUDE.md" ? "claude" : clis.includes("codex") ? "codex" : clis[0],
        path.join(kit, "templates", nome), path.join(projeto, nome), null, `Modelo de projeto ${nome}`);
    }
  }
  for (const cli of clis) {
    const rulesDestino = cli === "claude" ? path.join(raiz, ".claude", "rules")
      : local ? path.join(projeto, ".agents", "rules") : path.join(home, ".gemini", "config", "rules");
    const codexBase = path.join(raiz, ".codex", "vibecoding");
    const rulesCodex = [];
    if (kitClis.includes(cli)) {
      const rules = lerRules(path.join(kit, "rules")).filter((r) => escolhas.maestri || !r.nome.startsWith("maestri-"));
      for (const rule of rules) {
        if (cli === "claude") {
          adicionar("copiar", "kit", cli, rule.origem, path.join(rulesDestino, "vibecoding", rule.nome),
            null, `Rule do kit: ${rule.nome}`);
        } else if (cli === "agy") {
          adicionar("escrever", "kit", cli, rule.origem, path.join(rulesDestino, `vibecoding-${rule.nome}`),
            converterRuleAntigravity(rule.conteudo), `Rule convertida: ${rule.nome}`);
        } else {
          const destino = path.join(codexBase, "rules", rule.nome);
          if (lerFrontmatter(rule.conteudo).paths.length) {
            adicionar("copiar", "kit", cli, rule.origem, destino, null, `Rule sob demanda: ${rule.nome}`);
          }
          rulesCodex.push({ ...rule, destino });
        }
      }
      const skillsDestino = cli === "claude" ? path.join(raiz, ".claude", "skills")
        : cli === "codex" || local ? path.join(raiz, ".agents", "skills")
          : path.join(home, ".gemini", "config", "skills");
      for (const skill of entradas(path.join(kit, "skills"))) {
        if (!skill.isDirectory() || (!escolhas.maestri && skill.name.startsWith("maestri-"))) continue;
        adicionar("copiar", "kit", cli, path.join(kit, "skills", skill.name),
          path.join(skillsDestino, skill.name), null, `Skill do kit: ${skill.name}`);
      }
    }
    if (eccClis.includes(cli)) {
      const pacotes = lista(["common", ...(cli === "claude" ? ["web"] : []),
        ...(local ? escolhas.ecc?.stacks ?? [] : [])]);
      const arquivosPacotes = Object.fromEntries(pacotes.map((pacote) => {
        if (!/^[a-z0-9-]+$/i.test(pacote)) throw new Error(`Pacote ECC inválido: ${pacote}`);
        return [pacote, lerRules(path.join(ecc, "rules", pacote))];
      }));
      const mapa = cli === "agy" ? mapaEcc(arquivosPacotes) : null;
      for (const pacote of pacotes) {
        const pasta = path.join(ecc, "rules", pacote);
        const rules = arquivosPacotes[pacote];
        if (cli === "claude") {
          adicionar("copiar", "ecc", cli, pasta, path.join(rulesDestino, "ecc", pacote),
            null, `Rules ECC: ${pacote}`);
        } else if (cli === "agy") {
          const stack = pacote !== "common";
          if (stack && !STACK_GLOBS[pacote] && rules.some((r) => !lerFrontmatter(r.conteudo).paths.length)) {
            throw new Error(`Pacote ECC sem globs conhecidos: ${pacote}`);
          }
          const convertidas = achatarPacoteEcc(pacote, rules, { mapa, paths: stack ? STACK_GLOBS[pacote] ?? [] : [] });
          for (const [i, rule] of convertidas.entries()) {
            adicionar("escrever", "ecc", cli, rules[i].origem, path.join(rulesDestino, rule.nome),
              rule.conteudo, `Rule ECC achatada: ${rule.nome}`);
          }
        } else {
          // Mantém as pastas para preservar os links ../common/ no conteúdo original.
          adicionar("copiar", "ecc", cli, pasta, path.join(codexBase, "ecc", pacote), null, `Rules ECC: ${pacote}`);
          for (const rule of rules) rulesCodex.push({ ...rule, dono: "ecc",
            pacote, pastaDestino: path.join(codexBase, "ecc", pacote),
            destino: path.join(codexBase, "ecc", pacote, rule.nome),
            quando: pacote === "common" ? `código (${pacote}/${rule.nome})` : `a stack ${pacote} (${rule.nome})` });
        }
      }
    }
    if (cli === "codex" && rulesCodex.length) {
      adicionar("bloco", kitClis.includes(cli) ? "kit" : "ecc", cli, null,
        local ? path.join(projeto, "AGENTS.md") : path.join(home, ".codex", "AGENTS.md"),
        montarBlocoCodex(rulesCodex), "Rules e roteamento do Codex");
      const original = bytesCodex(acoes, home, projeto, estado.itens);
      if (original > 32 * 1024) {
        const acao = acoes.at(-1);
        acao.conteudo = montarBlocoCodex(rulesCodex, { porPacote: true });
        const reduzido = bytesCodex(acoes, home, projeto, estado.itens);
        const aviso = `Codex: contexto previsto de ${original} bytes ultrapassa 32 KiB; `
          + `roteamento reduzido para uma linha por pacote (${reduzido} bytes).`;
        if (reduzido > 32 * 1024) {
          throw new Error(`${aviso} Ainda excede o limite de 32768 bytes; reduza os AGENTS.md antes de instalar.`);
        }
        avisos.push(aviso);
      }
    }
  }
  const plano = acoes.map((acao) => ({ ...acao, situacao: situacaoDe(acao, estado.itens) }));
  if (avisos.length) plano.avisos = avisos;
  return plano;
}
