// Conversões puras. O subconjunto de YAML aceito é paths escalar, lista inline ou lista em linhas.
import path from "node:path";
const normalizar = (texto) => texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

function separarLista(texto) {
  const itens = [];
  let inicio = 0;
  let aspas = null;
  let chaves = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === "\\" && aspas === '"') i++;
      else if (c === aspas && texto[i + 1] === aspas && aspas === "'") i++;
      else if (c === aspas) aspas = null;
    } else if (c === '"' || c === "'") aspas = c;
    else if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === "," && !chaves) { itens.push(texto.slice(inicio, i)); inicio = i + 1; }
  }
  if (aspas || chaves) throw new Error("Lista paths inválida");
  itens.push(texto.slice(inicio));
  return itens.map((item) => {
    const valor = item.trim();
    if (valor.startsWith('"')) return JSON.parse(valor);
    if (valor.startsWith("'")) return valor.slice(1, -1).replace(/''/g, "'");
    return valor.replace(/\s+#.*$/, "").trim();
  }).filter(Boolean);
}

export function lerFrontmatter(texto) {
  const fonte = normalizar(texto);
  if (!fonte.startsWith("---\n")) return { paths: [], corpo: fonte };
  const fim = /^---[ \t]*$/m.exec(fonte.slice(4));
  if (!fim) throw new Error("Frontmatter sem fechamento");
  const cabecalho = fonte.slice(4, 4 + fim.index);
  const corpo = fonte.slice(4 + fim.index + fim[0].length).replace(/^\n/, "");
  const linhas = cabecalho.split("\n");
  const indice = linhas.findIndex((linha) => /^paths\s*:/.test(linha));
  if (indice < 0) return { paths: [], corpo };
  const valor = linhas[indice].replace(/^paths\s*:\s*/, "").trim();
  let paths;
  if (valor.startsWith("[")) {
    if (!valor.endsWith("]")) throw new Error("Lista paths inline inválida");
    paths = separarLista(valor.slice(1, -1));
  } else if (valor && !valor.startsWith("#")) paths = separarLista(valor);
  else {
    paths = [];
    for (const linha of linhas.slice(indice + 1)) {
      if (/^\S/.test(linha) && !linha.startsWith("-")) break;
      const item = linha.match(/^\s*-\s+(.+)$/);
      if (item) paths.push(...separarLista(item[1]));
      else if (linha.trim() && !linha.trim().startsWith("#")) throw new Error("Lista paths inválida");
    }
  }
  return { paths: [...new Set(paths)], corpo };
}

export function converterRuleAntigravity(texto, pathsPadrao = []) {
  const { paths, corpo } = lerFrontmatter(texto);
  const globs = paths.length ? paths : pathsPadrao;
  const gatilho = globs.length
    ? `trigger: glob\nglobs: ${JSON.stringify(globs.join(", "))}`
    : "trigger: always_on";
  return `---\n${gatilho}\n---\n${corpo}`;
}

// Cada rule: { nome, conteudo, destino?, dono?, quando? }. destino é obrigatório nas rules sob demanda.
// O executor é responsável pelos marcadores do bloco, como nas demais ações do tipo bloco.
export function montarBlocoCodex(rules, { porPacote = false } = {}) {
  const partes = ["## Rules do vibecoding-devtools"];
  const pacotes = new Set();
  for (const rule of rules) {
    if (porPacote && rule.dono === "ecc" && rule.pacote) {
      if (!pacotes.has(rule.pacote)) {
        const quando = rule.pacote === "common" ? "código" : `a stack ${rule.pacote}`;
        partes.push(`- Se a tarefa envolve ${quando}, leia o pacote ECC ${rule.pacote} em `
          + `\`${rule.pastaDestino.replace(/\\/g, "/")}\`.`);
        pacotes.add(rule.pacote);
      }
      continue;
    }
    const { paths, corpo } = lerFrontmatter(rule.conteudo);
    if (paths.length || rule.dono === "ecc") {
      if (!rule.destino) throw new Error(`Rule sob demanda sem destino: ${rule.nome}`);
      const quando = paths.length ? `arquivos ${paths.map((p) => JSON.stringify(p)).join(", ")}`
        : rule.quando ?? `o pacote ECC ${rule.nome}`;
      partes.push(`- Se a tarefa envolve ${quando}, leia \`${rule.destino.replace(/\\/g, "/")}\`.`);
    } else partes.push(corpo.trim());
  }
  return `${partes.filter(Boolean).join("\n\n")}\n`;
}

// Chaves relativas à pasta rules do ECC, em formato POSIX, inclusive em Windows.
export function mapaEcc(pacotes) {
  const mapa = new Map();
  const nomes = new Set();
  for (const [pacote, arquivos] of Object.entries(pacotes)) {
    if (!/^[a-z0-9-]+$/i.test(pacote)) throw new Error(`Pacote ECC inválido: ${pacote}`);
    for (const { nome } of arquivos) {
      if (!/^[^/\\]+\.md$/i.test(nome)) throw new Error(`Arquivo ECC inválido: ${nome}`);
      const destino = `ecc-${pacote}-${nome}`;
      if (nomes.has(destino.toLowerCase())) throw new Error(`Colisão ECC: ${destino}`);
      nomes.add(destino.toLowerCase());
      mapa.set(`${pacote}/${nome}`, destino);
    }
  }
  return mapa;
}

function reescreverLinksEcc(texto, origem, mapa) {
  const resolver = (alvo) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(alvo)) return undefined;
    const m = alvo.match(/^([^?#]+\.md)([?#].*)?$/i);
    if (!m) return undefined;
    let relativo;
    try { relativo = decodeURIComponent(m[1]); } catch { relativo = m[1]; }
    const chave = path.posix.normalize(path.posix.join(path.posix.dirname(origem), relativo));
    const destino = mapa.get(chave);
    return destino ? destino + (m[2] ?? "") : null;
  };
  // Links inline e definições de referência. Destinos não instalados perdem o vínculo, preservando o rótulo.
  let convertido = texto.replace(/(!?)\[([^\]\n]+)\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\)))?\s*\)/g,
    (todo, imagem, rotulo, entreAngulos, simples) => {
      const alvo = resolver(entreAngulos ?? simples);
      return alvo === undefined ? todo : alvo === null ? rotulo : `${imagem}[${rotulo}](${alvo})`;
    });
  const ausentes = new Set();
  convertido = convertido.replace(/^([ \t]{0,3})\[([^\]\n]+)\]:[ \t]*(?:<([^>\n]+)>|(\S+))(.*)$/gm,
    (todo, espaco, id, entreAngulos, simples, resto) => {
      const alvo = resolver(entreAngulos ?? simples);
      if (alvo === null) { ausentes.add(id.trim().toLowerCase()); return ""; }
      return alvo === undefined ? todo : `${espaco}[${id}]: ${alvo}${resto}`;
    });
  convertido = convertido.replace(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g, (todo, rotulo, id) =>
    ausentes.has((id || rotulo).trim().toLowerCase()) ? rotulo : todo);
  convertido = convertido.replace(/\[([^\]\n]+)\](?![\[(])/g, (todo, id) =>
    ausentes.has(id.trim().toLowerCase()) ? id : todo);
  // Referências em código inline usadas pelo ECC também não devem sugerir caminhos inexistentes.
  convertido = convertido.replace(/`([^`\n]+\.md(?:[?#][^`\n]*)?)`/g, (todo, alvo) => {
    const destino = resolver(alvo);
    return destino === undefined ? todo : destino === null ? alvo : `\`${destino}\``;
  });
  return convertido;
}

export function achatarPacoteEcc(pacote, arquivos, { paths = [], mapa = mapaEcc({ [pacote]: arquivos }) } = {}) {
  if (!/^[a-z0-9-]+$/i.test(pacote)) throw new Error(`Pacote ECC inválido: ${pacote}`);
  const nomes = new Set();
  return arquivos.map(({ nome, conteudo }) => {
    if (!/^[^/\\]+\.md$/i.test(nome)) throw new Error(`Arquivo ECC inválido: ${nome}`);
    const achatado = `ecc-${pacote}-${nome}`;
    if (nomes.has(achatado.toLowerCase())) throw new Error(`Colisão ECC: ${achatado}`);
    nomes.add(achatado.toLowerCase());
    const reescrito = reescreverLinksEcc(conteudo, `${pacote}/${nome}`, mapa);
    return { nome: achatado, conteudo: converterRuleAntigravity(reescrito, paths) };
  });
}
