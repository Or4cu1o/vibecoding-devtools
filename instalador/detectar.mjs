// Etapa 1 do instalador: o que existe na máquina e no projeto. Só lê; nunca grava nada.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CLIS, NODE_MINIMO } from "./clis.mjs";
import { lerEstado } from "./estado.mjs";

const ehWindows = (plataforma) => plataforma === "win32";

// Expande ~ e %VAR% de um caminho de pasta.
export function expandir(pasta, { env = process.env, home = os.homedir() } = {}) {
  return pasta
    .replace(/^~(?=$|[\\/])/, home)
    .replace(/%([^%]+)%/g, (_, nome) => env[nome] ?? env[nome.toUpperCase()] ?? `%${nome}%`);
}

// Procura um executável numa lista de pastas. No Windows, testa as extensões do PATHEXT.
export function procurarEm(bin, pastas, { env = process.env, plataforma = process.platform } = {}) {
  const exts = ehWindows(plataforma)
    ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean).map((e) => e.toLowerCase())
    : [""];
  for (const pasta of pastas) {
    for (const ext of exts) {
      const caminho = path.join(pasta, bin + ext);
      try {
        const st = fs.statSync(caminho);
        if (!st.isFile()) continue;
        if (!ehWindows(plataforma)) fs.accessSync(caminho, fs.constants.X_OK);
        return caminho;
      } catch (erro) {
        if (erro.code !== "ENOENT" && erro.code !== "ENOTDIR") {
          erro.caminho = caminho;
          throw erro;
        }
      }
    }
  }
  return null;
}

export function pastasDoPath(env = process.env) {
  return (env.PATH ?? env.Path ?? "")
    .split(path.delimiter)
    .map((p) => p.replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

// Primeira versão x.y.z na saída de `--version`.
export function extrairVersao(saida) {
  return saida?.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

function rodar(caminho, args, env) {
  // Arquivos .cmd e .bat só rodam por um shell no Windows. O caminho vem do disco e os argumentos são fixos do
  // instalador, nunca texto do usuário.
  const opcoes = { encoding: "utf8", timeout: 15000, windowsHide: true, env };
  const r = /\.(cmd|bat)$/i.test(caminho)
    ? spawnSync(`"${caminho}" ${args.join(" ")}`, { ...opcoes, shell: true })
    : spawnSync(caminho, args, opcoes);
  if (r.error) return { ok: false, erro: r.error.message };
  return { ok: r.status === 0, saida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

// Roda `--version`: o binário existir no disco não basta, ele precisa responder.
export function versaoDe(caminho, { env = process.env } = {}) {
  const r = rodar(caminho, ["--version"], env);
  if (!r.ok) return { ok: false, erro: r.erro ?? (r.saida || "--version falhou") };
  return { ok: true, versao: extrairVersao(r.saida) };
}

// Uma CLI: está no PATH? Se não, está numa pasta conhecida (instalada, mas fora do PATH)?
export function detectarCli(cli, { env = process.env, plataforma = process.platform,
  home = env.HOME ?? env.USERPROFILE ?? os.homedir() } = {}) {
  env = { ...env, HOME: home, USERPROFILE: home };
  let noPath;
  let caminho;
  try {
    noPath = procurarEm(cli.bin, pastasDoPath(env), { env, plataforma });
    const pastas = (ehWindows(plataforma) ? cli.pastas.win : cli.pastas.unix).map((p) => expandir(p, { env, home }));
    caminho = noPath ?? procurarEm(cli.bin, pastas, { env, plataforma });
  } catch (erro) {
    return { id: cli.id, nome: cli.nome, estado: "erro", caminho: erro.caminho, erro: erro.message };
  }
  const instalar = ehWindows(plataforma) ? cli.instalar.win : cli.instalar.unix;
  if (!caminho) return { id: cli.id, nome: cli.nome, estado: "ausente", instalar };
  const v = versaoDe(caminho, { env });
  const base = { id: cli.id, nome: cli.nome, caminho, pasta: path.dirname(caminho) };
  if (!v.ok) return { ...base, estado: "erro", erro: v.erro };
  return { ...base, estado: noPath ? "ok" : "fora-do-path", versao: v.versao };
}

export function verificarNode(versao = process.versions.node) {
  const maior = Number(versao.split(".")[0]);
  return { versao, ok: maior >= NODE_MINIMO, minimo: NODE_MINIMO };
}

// Ferramenta de linha de comando que precisa estar no PATH e responder a `--version` (git, gitleaks).
export function verificarFerramenta(bin, { env = process.env, plataforma = process.platform } = {}) {
  let caminho;
  try { caminho = procurarEm(bin, pastasDoPath(env), { env, plataforma }); }
  catch (erro) { return { ok: false, estado: "erro", caminho: erro.caminho, erro: erro.message }; }
  if (!caminho) return { ok: false, erro: "não encontrado no PATH" };
  const v = versaoDe(caminho, { env });
  return v.ok ? { ok: true, caminho, versao: v.versao } : { ok: false, caminho, erro: v.erro };
}

// Pacotes de rules do ECC sugeridos pelos arquivos do projeto.
const POR_ARQUIVO = [
  [/^(package\.json|tsconfig\.json)$/, "typescript"],
  [/^(pyproject\.toml|requirements.*\.txt|setup\.py|Pipfile)$/, "python"],
  [/^go\.mod$/, "golang"],
  [/^Cargo\.toml$/, "rust"],
  [/^(pom\.xml|build\.gradle)$/, "java"],
  [/^build\.gradle\.kts$/, "kotlin"],
  [/^composer\.json$/, "php"],
  [/^Gemfile$/, "ruby"],
  [/^Package\.swift$/, "swift"],
  [/\.(csproj|sln)$/, "csharp"],
  [/\.fsproj$/, "fsharp"],
  [/^pubspec\.yaml$/, "dart"],
  [/^CMakeLists\.txt$/, "cpp"],
  [/^(cpanfile|Makefile\.PL)$/, "perl"],
  [/^oh-package\.json5$/, "arkts"],
];
const POR_DEPENDENCIA = [
  ["react-native", "react-native"],
  ["react", "react"],
  ["next", "react"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
];

export function stacksDe({ arquivos = [], dependencias = [] }) {
  const stacks = new Set();
  for (const nome of arquivos) for (const [re, pacote] of POR_ARQUIVO) if (re.test(nome)) stacks.add(pacote);
  for (const [dep, pacote] of POR_DEPENDENCIA) if (dependencias.includes(dep)) stacks.add(pacote);
  return [...stacks].sort();
}

const IGNORADAS = new Set(["node_modules", ".git", "vendor", "dist", "build", "target", ".venv", "venv"]);

// Arquivos da raiz e de até dois níveis abaixo (monorepos: apps/*, packages/*), sem pastas geradas.
function arquivosDoProjeto(raiz, profundidade = 2) {
  const arquivos = [];
  const dependencias = new Set();
  const visitar = (pasta, nivel) => {
    let entradas;
    try {
      entradas = fs.readdirSync(pasta, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      if (e.isDirectory()) {
        if (nivel < profundidade && !IGNORADAS.has(e.name) && !e.name.startsWith(".")) {
          visitar(path.join(pasta, e.name), nivel + 1);
        }
      } else {
        arquivos.push(e.name);
        if (e.name === "package.json") {
          try {
            const pkg = JSON.parse(fs.readFileSync(path.join(pasta, e.name), "utf8"));
            for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) dependencias.add(d);
          } catch {
            // package.json inválido: ignora as dependências
          }
        }
      }
    }
  };
  visitar(raiz, 0);
  return { arquivos, dependencias: [...dependencias] };
}

export function detectarProjeto(cwd = process.cwd(), { env = process.env } = {}) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, env, encoding: "utf8", windowsHide: true });
  if (r.error) return { emRepositorio: false, motivo: "git não roda" };
  if (r.status !== 0) {
    // 128 também aparece quando o git recusa o repositório (por exemplo, "dubious ownership"): mostre o motivo.
    const erro = (r.stderr ?? "").trim().split("\n")[0];
    const fora = /not a git repository/i.test(erro);
    return { emRepositorio: false, motivo: fora ? "fora de um repositório git" : erro || "git falhou" };
  }
  const raiz = path.resolve(r.stdout.trim());
  return { emRepositorio: true, raiz, stacks: stacksDe(arquivosDoProjeto(raiz)) };
}

function normalizarPlugin(cli, item) {
  const { secaoInstalada, ...campos } = item;
  const name = item.name ?? item.id ?? item.nome;
  if (typeof name !== "string" || !name.trim()) throw new Error("Plugin sem nome reconhecido");
  const status = typeof (item.status ?? item.state) === "string"
    ? (item.status ?? item.state).replace(/^[^a-z]+/i, "").trim() : null;
  let instalado = null; // Status ausente não comprova instalação nem ausência.
  if (typeof item.instalado === "boolean") instalado = item.instalado;
  else if (typeof item.installed === "boolean") instalado = item.installed;
  else if (/^installed\b/i.test(status ?? "")) instalado = true;
  else if (/^(?:not[\s_-]+installed|uninstalled)\b/i.test(status ?? "")) instalado = false;
  else if (cli !== "codex" && /^(?:enabled|disabled)\b/i.test(status ?? "")) instalado = true;
  else if (cli !== "codex" && typeof secaoInstalada === "boolean") instalado = secaoInstalada;
  else if (cli !== "codex" && status === null && typeof item.enabled === "boolean") instalado = true;
  return { ...campos, name: name.trim(), version: item.version ?? item.versao ?? null, status, instalado };
}

export function analisarPlugins(cli, saida) {
  const texto = saida.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").trim();
  if (cli === "agy" || /^[\[{]/.test(texto)) {
    const json = JSON.parse(texto);
    const itens = Array.isArray(json) ? json : json?.plugins;
    if (!Array.isArray(itens)) throw new Error("Resposta de plugins sem lista reconhecida");
    return itens.map((item) => {
      if (!item || typeof item !== "object") throw new Error("Item de plugin sem campos reconhecidos");
      return normalizarPlugin(cli, item);
    });
  }
  if (!texto) throw new Error("Resposta vazia de plugins");
  const linhasUtilizaveis = texto.split(/\r?\n/).map((linha) => linha.trim())
    .filter((linha) => linha && !/^warning\b/i.test(linha));
  const textoUtilizavel = linhasUtilizaveis.join(" ").replace(/\s+/g, " ").trim();
  // Saídas oficiais para uma instalação nova. O Codex pode preceder a resposta
  // vazia com avisos sobre os aliases de PATH.
  if (cli === "codex") {
    if (/^no marketplace plugins found\.?$/i.test(textoUtilizavel)) return [];
  }
  if (cli === "claude" && /^no plugins installed\. use (?:\x60claude plugin install\x60|claude plugin install) to install a plugin\.$/i.test(textoUtilizavel)) return [];
  const itens = [];
  let instaladoNaSecao;
  let atual;
  let reconheceu = false;
  let aguardandoTabelaMarketplace = false;
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa) continue;
    if (/^warning\b/i.test(limpa)) continue;
    if (/^Marketplace\s+`[^`]+`$/i.test(limpa)) {
      aguardandoTabelaMarketplace = true;
      atual = undefined;
      continue;
    }
    if (/^PLUGIN\s+STATUS\s+VERSION\s+SOURCE$/i.test(limpa)) {
      reconheceu = true;
      aguardandoTabelaMarketplace = false;
      continue;
    }
    if (aguardandoTabelaMarketplace) continue;
    if (/^installed plugins\s*:/i.test(limpa)) { instaladoNaSecao = true; reconheceu = true; continue; }
    if (/^(?:available|catalog) plugins\s*:/i.test(limpa)) { instaladoNaSecao = false; reconheceu = true; continue; }
    const campo = cli === "claude" && limpa.match(/^(Version|Scope|Status):\s*(.*)$/i);
    if (campo && atual) {
      atual[{ version: "version", scope: "scope", status: "status" }[campo[1].toLowerCase()]] = campo[2];
      continue;
    }
    // Claude lista plugins instalados em blocos, com Version/Scope/Status abaixo do nome.
    const nomeClaude = cli === "claude" && limpa.match(/^(?:[❯>•*-]\s*)?([a-z\d._/-]+@[a-z\d._/-]+)$/i);
    if (nomeClaude) {
      reconheceu = true;
      atual = { name: nomeClaude[1] };
      if (instaladoNaSecao !== undefined) atual.secaoInstalada = instaladoNaSecao;
      itens.push(atual);
      continue;
    }
    if (/^[|:\s+─━┌┬┐└┴┘├┼┤-]+$/.test(limpa)) continue;
    const celulas = limpa.includes("|") ? limpa.split("|").map((c) => c.trim()).filter(Boolean) : null;
    const m = celulas ? null : limpa.match(/^([a-z\d_.@/-]+)\s+(.+)$/i);
    const name = celulas?.[0] ?? m?.[1];
    if (!name) continue;
    if (/^(?:name|nome|plugin|plugins)$/i.test(name)) { reconheceu = true; continue; }
    const resto = celulas ? celulas.slice(1).join(" ") : m[2];
    const status = celulas?.slice(1).find((c) => /^(?:not\s+)?installed\b/i.test(c))
      ?? resto.match(/^(?:\d+\.\d+\.\d+\s+)?((?:not\s+)?installed\b(?:,\s*(?:enabled|disabled))?)/i)?.[1]
      ?? (cli !== "codex" ? resto.match(/\b(enabled|disabled)\b/i)?.[1] : null);
    atual = { name, status: status ?? null, version: extrairVersao(resto), original: linha };
    reconheceu = true;
    if (cli === "claude" && instaladoNaSecao !== undefined) atual.secaoInstalada = instaladoNaSecao;
    itens.push(atual);
  }
  if (!reconheceu) throw new Error("Resposta de plugins sem formato reconhecido");
  return itens.map((item) => normalizarPlugin(cli, item));
}

// executarPlugins tem a assinatura de spawnSync(cmd, args, opções). Nos testes, nenhuma CLI real é chamada.
export function detectarInstalados({ home, projeto = null, clis = [], executarPlugins = spawnSync } = {}) {
  if (!home) throw new Error("detectarInstalados exige home");
  const estado = lerEstado({ home });
  const nomes = fs.readdirSync(new URL("../skills/", import.meta.url), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const skills = [];
  const pastas = {
    claude: [["global", path.join(home, ".claude", "skills")]],
    codex: [["global", path.join(home, ".agents", "skills")]],
    agy: [["global", path.join(home, ".gemini", "config", "skills")]],
  };
  if (projeto) {
    pastas.claude.push(["projeto", path.join(projeto, ".claude", "skills")]);
    for (const cli of ["codex", "agy"]) pastas[cli].push(["projeto", path.join(projeto, ".agents", "skills")]);
  }
  for (const [cli, locais] of Object.entries(pastas)) {
    for (const [escopo, pasta] of locais) {
      for (const nome of nomes) {
        const caminho = path.join(pasta, nome);
        try {
          fs.lstatSync(caminho);
          skills.push({ cli, escopo, nome, caminho });
        } catch (erro) {
          if (erro.code !== "ENOENT" && erro.code !== "ENOTDIR") throw erro;
        }
      }
    }
  }
  const plugins = {};
  for (const { id } of CLIS) {
    const cli = clis.find((c) => c.id === id);
    plugins[id] = { estado: "desconhecido", itens: null, erro: "CLI não detectada" };
    if (!cli?.caminho || cli.estado === "ausente") continue;
    try {
      if (id === "codex" || id === "claude") {
        const configDir = path.join(home, id === "codex" ? ".codex" : ".claude");
        try {
          if (!fs.statSync(configDir).isDirectory()) {
            throw new Error(`A pasta de configuração não é um diretório: ${configDir}`);
          }
        } catch (erro) {
          if (erro.code !== "ENOENT" && erro.code !== "ENOTDIR") throw erro;
          plugins[id] = { estado: "conhecido", itens: [], saida: "", motivo: "diretório de configuração ausente" };
          continue;
        }
      }
      const args = ["plugin", "list", ...(id === "agy" ? ["--json"] : [])];
      const env = { ...process.env };
      for (const [nome, valor] of Object.entries({ HOME: home, USERPROFILE: home,
        CODEX_HOME: path.join(home, ".codex"), CLAUDE_CONFIG_DIR: path.join(home, ".claude") })) {
        // Evita duas chaves com capitalização diferente no ambiente de subprocessos Windows.
        if (process.platform === "win32") for (const existente of Object.keys(env)) {
          if (existente.toUpperCase() === nome) delete env[existente];
        }
        env[nome] = valor;
      }
      // Codex consulta o catálogo remoto: a tabela pode ultrapassar 2 MB e levar mais de 3 segundos.
      const opcoes = { encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024, windowsHide: true,
        cwd: projeto ?? home, env };
      let comando = cli.caminho;
      let argumentos = args;
      if (process.platform === "win32" && /\.(cmd|bat)$/i.test(comando)) {
        if (/["%!\r\n\0]/.test(comando)) throw new Error("Caminho de CLI inválido para cmd.exe");
        argumentos = ["/d", "/s", "/c", `"\"${comando}\" ${args.join(" ")}"`];
        comando = "cmd.exe";
        opcoes.windowsVerbatimArguments = true;
      }
      const r = executarPlugins(comando, argumentos, opcoes);
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`plugin list falhou (${r.status ?? r.signal ?? "sem status"})`);
      const saida = String(r.stdout ?? "").trim();
      const itens = analisarPlugins(id, saida);
      plugins[id] = { estado: "conhecido", itens, saida };
    } catch (erro) {
      plugins[id] = { estado: "desconhecido", itens: null, erro: erro.message };
    }
  }
  return { estado, skills, plugins };
}

export function detectarTudo({ cwd = process.cwd(), env = process.env, plataforma = process.platform,
  home = env.HOME ?? env.USERPROFILE ?? os.homedir(), executarPlugins = spawnSync } = {}) {
  env = { ...env, HOME: home, USERPROFILE: home };
  const clis = CLIS.map((cli) => detectarCli(cli, { env, plataforma, home }));
  const projeto = detectarProjeto(cwd, { env });
  return {
    plataforma,
    node: verificarNode(),
    git: verificarFerramenta("git", { env, plataforma }),
    gitleaks: verificarFerramenta("gitleaks", { env, plataforma }),
    clis,
    projeto,
    instalados: detectarInstalados({ home, projeto: projeto.emRepositorio ? projeto.raiz : null,
      clis, executarPlugins }),
  };
}
