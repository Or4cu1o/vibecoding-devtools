// Etapa 1 do instalador: o que existe na máquina e no projeto. Só lê; nunca grava nada.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CLIS, NODE_MINIMO } from "./clis.mjs";

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
      } catch {
        // não está aqui
      }
    }
  }
  return null;
}

export function pastasDoPath(env = process.env) {
  return (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);
}

// Primeira versão x.y.z na saída de `--version`.
export function extrairVersao(saida) {
  return saida?.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

function rodar(caminho, args) {
  // Arquivos .cmd e .bat só rodam por um shell no Windows. O caminho vem do disco e os argumentos são fixos do
  // instalador, nunca texto do usuário.
  const opcoes = { encoding: "utf8", timeout: 15000, windowsHide: true };
  const r = /\.(cmd|bat)$/i.test(caminho)
    ? spawnSync(`"${caminho}" ${args.join(" ")}`, { ...opcoes, shell: true })
    : spawnSync(caminho, args, opcoes);
  if (r.error) return { ok: false, erro: r.error.message };
  return { ok: r.status === 0, saida: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

export function versaoDe(caminho) {
  const r = rodar(caminho, ["--version"]);
  return r.ok ? extrairVersao(r.saida) : null;
}

// Uma CLI: está no PATH? Se não, está numa pasta conhecida (instalada, mas fora do PATH)?
export function detectarCli(cli, { env = process.env, plataforma = process.platform } = {}) {
  const noPath = procurarEm(cli.bin, pastasDoPath(env), { env, plataforma });
  const home = env.HOME ?? os.homedir();
  const pastas = (ehWindows(plataforma) ? cli.pastas.win : cli.pastas.unix).map((p) => expandir(p, { env, home }));
  const caminho = noPath ?? procurarEm(cli.bin, pastas, { env, plataforma });
  const instalar = ehWindows(plataforma) ? cli.instalar.win : cli.instalar.unix;
  if (!caminho) return { id: cli.id, nome: cli.nome, estado: "ausente", instalar };
  return {
    id: cli.id,
    nome: cli.nome,
    estado: noPath ? "ok" : "fora-do-path",
    caminho,
    pasta: path.dirname(caminho),
    versao: versaoDe(caminho),
  };
}

export function verificarNode(versao = process.versions.node) {
  const maior = Number(versao.split(".")[0]);
  return { versao, ok: maior >= NODE_MINIMO, minimo: NODE_MINIMO };
}

export function verificarGit({ env = process.env, plataforma = process.platform } = {}) {
  const caminho = procurarEm("git", pastasDoPath(env), { env, plataforma });
  return caminho ? { ok: true, caminho, versao: versaoDe(caminho) } : { ok: false };
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

export function detectarProjeto(cwd = process.cwd()) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return { emRepositorio: false };
  const raiz = path.resolve(r.stdout.trim());
  return { emRepositorio: true, raiz, stacks: stacksDe(arquivosDoProjeto(raiz)) };
}

export function detectarTudo({ cwd = process.cwd(), env = process.env, plataforma = process.platform } = {}) {
  return {
    plataforma,
    node: verificarNode(),
    git: verificarGit({ env, plataforma }),
    clis: CLIS.map((cli) => detectarCli(cli, { env, plataforma })),
    projeto: detectarProjeto(cwd),
  };
}
