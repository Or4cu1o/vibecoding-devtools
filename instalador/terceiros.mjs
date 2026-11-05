// Planejar terceiros não executa comandos nem grava arquivos. Só obterEcc baixa o repositório.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const terceiros = JSON.parse(fs.readFileSync(new URL("./terceiros.json", import.meta.url), "utf8"));
const CLIS = ["claude", "codex", "agy"];
const providers = { claude: "claude", codex: "codex", agy: "antigravity" };
const versaoDe = (valor) => typeof valor === "string" ? valor.match(/\d+\.\d+\.\d+(?:-[\w.-]+)?/)?.[0] ?? null : null;

/** Só lê install-state. Saída: { ecc: [{cli, escopo, metodo, versao, arquivo}], avisos: [] }. */
export function detectarTerceiros(home, projeto = null) {
  if (!home) throw new Error("detectarTerceiros exige home");
  const resultado = { ecc: [], avisos: [] };
  const locais = [["claude", "global", path.join(home, ".claude", "ecc", "install-state.json")]];
  if (projeto) locais.push(
    ["claude", "projeto", path.join(projeto, ".claude", "ecc", "install-state.json")],
    ["agy", "projeto", path.join(projeto, ".agents", "ecc-install-state.json")],
  );
  for (const [cli, escopo, arquivo] of locais) {
    let texto;
    try { texto = fs.readFileSync(arquivo, "utf8"); }
    catch (erro) {
      if (["ENOENT", "ENOTDIR"].includes(erro.code)) continue;
      throw erro;
    }
    const item = { cli, escopo, metodo: "npx", arquivo, versao: null };
    try {
      const estado = JSON.parse(texto.replace(/^\uFEFF/, ""));
      if (!estado || typeof estado !== "object" || Array.isArray(estado)) throw new Error("objeto esperado");
      // schemaVersion/version numérico descreve o formato, não a versão do ECC.
      item.versao = versaoDe(estado.eccVersion) ?? versaoDe(estado.packageVersion)
        ?? versaoDe(estado.source?.version) ?? versaoDe(estado.version) ?? versaoDe(estado.versao);
    } catch (erro) {
      item.erro = `Install-state inválido: ${arquivo}: ${erro.message}`;
      resultado.avisos.push(item.erro);
    }
    resultado.ecc.push(item);
  }
  return resultado;
}

function pluginDe(deteccao, cli, dono, escopo) {
  const lista = deteccao.instalados?.plugins?.[cli] ?? deteccao.plugins?.[cli];
  const itens = Array.isArray(lista) ? lista
    : lista?.estado === "conhecido" && Array.isArray(lista.itens) ? lista.itens : null;
  if (!itens || itens.some((item) => typeof item?.instalado !== "boolean")) return { conhecido: false };
  const plugin = itens.find((item) => {
    if (!item.instalado || (item.escopo && item.escopo !== escopo)) return false;
    const nome = item.id ?? item.name ?? item.nome ?? "";
    return dono === "ecc" ? /\b(?:ecc|everything-claude-code)\b/i.test(nome) : /\bimpeccable\b/i.test(nome);
  });
  return { conhecido: true, plugin };
}

function temSkillImpeccable(cli, raiz, local) {
  const pastas = cli === "claude" ? [".claude"] : cli === "codex" ? [".agents"]
    : local ? [".agents", ".agent"] : [path.join(".gemini", "config")];
  return pastas.some((pasta) => {
    try { return fs.statSync(path.join(raiz, pasta, "skills", "impeccable", "SKILL.md")).isFile(); }
    catch (erro) {
      if (["ENOENT", "ENOTDIR"].includes(erro.code)) return false;
      throw erro;
    }
  });
}

/** Lista de comandos; avisos sem comando ficam em lista.avisos (o chamador deve mostrá-los).
 * Aceita detectarTerceiros em deteccao.terceiros ou deteccao.instalados.terceiros;
 * plugins já consultados em deteccao.instalados.plugins[cli].itens. Não consulta CLIs.
 */
export function acoesTerceiros(escolhas, deteccao = {}, caminhos = {}) {
  const { home, projeto } = caminhos;
  if (!home) throw new Error("caminhos.home é obrigatório");
  if (!["global", "projeto"].includes(escolhas.escopo)) throw new Error("Escopo inválido");
  const local = escolhas.escopo === "projeto";
  if (local && !projeto) throw new Error("Escopo projeto exige caminhos.projeto");
  const selecionar = (dono) => {
    const itens = [...new Set(escolhas[dono]?.clis ?? [])];
    if (itens.some((cli) => !CLIS.includes(cli))) throw new Error("CLI inválida");
    return CLIS.filter((cli) => itens.includes(cli));
  };
  const eccClis = selecionar("ecc"), impeccableClis = selecionar("impeccable");
  const instalados = deteccao.terceiros ?? deteccao.instalados?.terceiros ?? detectarTerceiros(home, projeto);
  const acoes = [];
  acoes.avisos = [...(instalados.avisos ?? [])];
  const npx = (deteccao.plataforma ?? process.platform) === "win32" ? "npx.cmd" : "npx";
  const cwd = projeto ?? home;
  const codexHome = path.join(home, ".codex");
  const situacao = (dono, cli, metodo) => {
    const { conhecido, plugin } = pluginDe(deteccao, cli, dono, escolhas.escopo);
    if (!conhecido) {
      const nome = dono === "ecc" ? "ECC" : "Impeccable";
      acoes.avisos.push(`Não foi possível confirmar se o ${nome} já está instalado por plugin em ${cli}; instalação bloqueada.`);
      return "conflito";
    }
    if (plugin) {
      if (metodo !== "plugin") {
        acoes.avisos.push(`${dono} em ${cli} já instalado por plugin; método ativo preservado.`);
        return "igual";
      }
      const versao = versaoDe(typeof plugin === "string" ? plugin : plugin.version ?? plugin.versao);
      return !versao || versao === terceiros[dono].versao ? "igual" : "atualizar";
    }
    const anterior = (instalados[dono] ?? []).find((i) => i.cli === cli && i.escopo === escolhas.escopo);
    if (!anterior) return "nova";
    if (anterior.erro) return "conflito";
    if (anterior.metodo && anterior.metodo !== metodo) {
      acoes.avisos.push(`${dono} em ${cli} já instalado por ${anterior.metodo}; método ativo preservado.`);
      return "igual";
    }
    if (!anterior.versao) acoes.avisos.push(`${dono} em ${cli} já instalado, sem versão; instalação preservada.`);
    return !anterior.versao || anterior.versao === terceiros[dono].versao ? "igual" : "atualizar";
  };
  const adicionar = (dono, cli, cmd, args, estado, extra = {}) => {
    acoes.push({ tipo: "comando", dono, cli, cmd, args, cwd, env: {}, escopo: escolhas.escopo,
      versao: terceiros[dono].versao, situacao: estado, descricao: `${dono} em ${cli}`, ...extra });
  };
  for (const cli of eccClis) {
    if (cli === "codex" && !fs.existsSync(codexHome)) {
      acoes.avisos.push("Abra o Codex uma vez e rode o instalador de novo para instalar o ECC no Codex.");
      continue;
    }
    if (cli === "agy" && !local) {
      acoes.avisos.push("ECC no Antigravity só pode ser instalado no escopo projeto (./.agents); instalação global omitida.");
      continue;
    }
    const estado = situacao("ecc", cli, cli === "codex" ? "plugin" : "npx");
    if (cli === "codex") {
      const cmd = deteccao.clis?.find((c) => c.id === cli)?.caminho ?? "codex";
      const env = { CODEX_HOME: codexHome };
      adicionar("ecc", cli, cmd, ["plugin", "marketplace", "add", terceiros.ecc.marketplace], estado, { env });
      adicionar("ecc", cli, cmd, ["plugin", "add", terceiros.ecc.plugin], estado,
        { env, desinstalar: { cmd, args: ["plugin", "remove", terceiros.ecc.plugin], cwd, env } });
      if (escolhas.ecc?.hooks) acoes.avisos.push("Hooks do ECC no Codex precisam de aprovação no /hooks.");
      continue;
    }
    const hooks = cli === "claude" && escolhas.ecc?.hooks === true;
    const modulos = [...terceiros.ecc.modulos, ...(hooks ? [terceiros.ecc.moduloHooks] : [])];
    const target = cli === "agy" ? "antigravity" : local ? "claude-project" : "claude";
    const pacote = `${terceiros.ecc.pacote}@${terceiros.ecc.versao}`;
    adicionar("ecc", cli, npx, ["-y", pacote, "install", "--target", target,
      "--modules", modulos.join(","), hooks ? "--enable-hooks" : "--no-hooks"], estado,
    { desinstalar: { cmd: npx, args: ["-y", pacote, "uninstall", "--target", target], cwd } });
    if (cli === "agy" && escolhas.ecc?.hooks) acoes.avisos.push("ECC no Antigravity é experimental e não oferece hooks.");
  }
  if (impeccableClis.length) {
    const pacote = `${terceiros.impeccable.pacote}@${terceiros.impeccable.versao}`;
    const faltantes = impeccableClis.filter((cli) => !temSkillImpeccable(cli, local ? projeto : home, local));
    // Agrupa só CLIs com a mesma situação: uma já instalada nunca é reinstalada junto com outra nova.
    const grupos = new Map();
    for (const cli of faltantes.length ? faltantes : impeccableClis) {
      const estado = faltantes.length ? situacao("impeccable", cli, "npx") : "igual";
      if (!grupos.has(estado)) grupos.set(estado, []);
      grupos.get(estado).push(cli);
    }
    const aviso = "Impeccable 4.8.0 não oferece desinstalação; confirme manualmente os arquivos criados antes de removê-los.";
    acoes.avisos.push(aviso);
    const extra = { cwd: local ? projeto : home, env: { DO_NOT_TRACK: "1" }, aviso };
    const estadoTelemetria = [...grupos.keys()].every((estado) => estado === "igual") ? "igual" : "nova";
    adicionar("impeccable", impeccableClis[0], npx, ["-y", pacote, "telemetry", "off"], estadoTelemetria, extra);
    for (const [estado, clis] of grupos) adicionar("impeccable", clis[0], npx,
      ["-y", pacote, "install", `--providers=${clis.map((cli) => providers[cli]).join(",")}`,
        local ? "--project" : "--global", "-y",
        ...(escolhas.impeccable?.hooks === true ? [] : ["--no-hooks"])], estado, { ...extra, clis });
  }
  return acoes;
}

/** Execução explícita, fora do planejamento. cacheDir = home/.vibecoding-devtools/cache.
 * Retorna a pasta para caminhos.ecc. executar é injetável; testes nunca precisam de rede.
 */
export function obterEcc(cacheDir, { executar = spawnSync } = {}) {
  if (!cacheDir) throw new Error("obterEcc exige cacheDir");
  const cache = path.resolve(cacheDir);
  const destino = path.join(cache, `ecc-${terceiros.ecc.versao}`);
  const rodar = (args, cwd) => {
    const r = executar("git", args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`Falha ao obter ECC: ${r.stderr ?? r.status}`);
    return String(r.stdout ?? "").trim();
  };
  if (fs.existsSync(destino)) {
    const tag = rodar(["describe", "--tags", "--exact-match", "HEAD"], destino);
    if (tag !== terceiros.ecc.tag || !fs.existsSync(path.join(destino, "rules"))) {
      throw new Error(`Cache ECC inválido: ${destino}; esperado ${terceiros.ecc.tag} com rules`);
    }
    return destino;
  }
  fs.mkdirSync(cache, { recursive: true });
  rodar(["clone", "--depth", "1", "--branch", terceiros.ecc.tag, terceiros.ecc.repositorio, destino], cache);
  return destino;
}
