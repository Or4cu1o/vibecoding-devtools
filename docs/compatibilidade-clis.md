# Compatibilidade entre CLIs

Como Claude Code, Codex e Antigravity carregam instruções, rules, skills, hooks e agentes. O Claude Code é a fonte; o
instalador converte para os outros dois a partir desta tabela.

Verificado em 2026-10-29 com Claude Code 2.1.302, Codex 0.164.0 e Antigravity CLI 1.4.9. **Revisão deste arquivo:** a cada
versão nova de uma das CLIs que mude carregamento, hooks ou plugins.

## Binário e instalação

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Binário | `claude` | `codex` | `agy` |
| Versão | `claude --version` | `codex --version` | `agy --version` |
| Diagnóstico | `claude doctor` | `codex doctor` | — |
| Instalar (macOS, Linux) | `curl -fsSL https://claude.ai/install.sh \| bash` | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` | `curl -fsSL https://antigravity.google/cli/install.sh \| bash` |
| Instalar (Windows) | `irm https://claude.ai/install.ps1 \| iex` | `irm https://chatgpt.com/codex/install.ps1 \| iex` | `irm https://antigravity.google/cli/install.ps1 \| iex` |
| Pasta do binário (Unix) | `~/.local/bin` | `~/.local/bin` | `~/.local/bin` |
| Pasta do binário (Windows) | `%USERPROFILE%\.local\bin` | `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` | `%LOCALAPPDATA%\agy\bin` |
| Pasta de configuração | `~/.claude/` | `~/.codex/` (`CODEX_HOME`) | `~/.gemini/config/` e `~/.gemini/antigravity-cli/` |

Nenhuma das três traz Node ou Python. Depois de instalar, confira se a pasta do binário está no `PATH`.

## Arquivo de instruções

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Lê | `CLAUDE.md`; `AGENTS.md` só quando não há nenhum `CLAUDE.md` | `AGENTS.md` (`AGENTS.override.md` vence) | `AGENTS.md` e `GEMINI.md` |
| Lê `CLAUDE.md` | sim | não | não |
| Global | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.gemini/AGENTS.md`, `~/.gemini/config/AGENTS.md` |
| Projeto | raiz e ancestrais; subpastas ao tocar arquivos nelas | da raiz do git até a pasta atual, um arquivo por pasta | das pastas do arquivo em uso até a raiz |
| Importar outro arquivo | `@caminho` | — | `@[rótulo](caminho)` |
| Limite | recomendado < 200 linhas | **32 KiB somando todos** (`project_doc_max_bytes`) | 24.000 bytes por arquivo |

**Padrão do kit:** `AGENTS.md` é a fonte única no projeto e o `CLAUDE.md` tem só `@AGENTS.md` (no Windows, use o import,
não link simbólico).

## Rules

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Pasta global | `~/.claude/rules/**/*.md` | não existe | `~/.gemini/config/rules/*.md` |
| Pasta do projeto | `.claude/rules/**/*.md` | não existe | `.agents/rules/*.md` (só o primeiro nível) |
| Sempre ativa | sem frontmatter | — | `trigger: always_on` |
| Ativa por arquivo | `paths:` (lista de globs) | — | `trigger: glob` + `globs:` (texto separado por vírgula) |
| Frontmatter faltando | carrega sempre | — | **arquivo descartado sem aviso** |

- **Conversão para o Antigravity:** rule sem `paths:` ganha `trigger: always_on`; com `paths:`, vira `trigger: glob` e
  `globs:`.
- **Conversão para o Codex:** não há pasta de rules. As regras sempre válidas entram num bloco marcado do `AGENTS.md`; as
  grandes entram como linha da tabela de roteamento ("se a tarefa envolve X, leia Y"), dentro do limite de 32 KiB.
- No Codex, "rules" (`~/.codex/rules/*.rules`, Starlark) são políticas de comando: `prefix_rule(...)` com
  `decision="forbidden"` bloqueia um comando de vez. Úteis para proibições duras, como `git push --force`.

## Skills

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Global | `~/.claude/skills/<nome>/` | `~/.agents/skills/<nome>/` | `~/.gemini/config/skills/<nome>/` |
| Projeto | `.claude/skills/<nome>/` | `.agents/skills/<nome>/` | `.agents/skills/<nome>/` |
| Frontmatter portável | `name`, `description` | `name`, `description` | `name`, `description` |
| `references/`, `scripts/` | sim | sim | sim |

O mesmo `SKILL.md` funciona nas três. Campos além de `name` e `description` (como `user-invocable`) só valem no Claude Code
e são ignorados pelas outras. No projeto, Codex e Antigravity leem a mesma `.agents/skills/`.

## Hooks

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Arquivo global | `~/.claude/settings.json` | `~/.codex/hooks.json` | `~/.gemini/config/hooks.json` |
| Arquivo do projeto | `.claude/settings.json` | `.codex/hooks.json` (só em projeto confiável) | `.agents/hooks.json` |
| Formato | `{"hooks":{"PreToolUse":[{"matcher","hooks":[...]}]}}` | igual ao Claude Code | `{"<nome>":{"enabled":true,"PreToolUse":[...]}}` |
| Ferramenta de shell | `Bash` | `Bash` | `run_command` |
| Comando recebido em | `tool_input.command` | `tool_input.command` | `toolCall.args.CommandLine` |
| Bloquear | exit 2 (motivo no stderr) ou `permissionDecision: "deny"` | exit 2 ou `permissionDecision: "deny"` | stdout `{"decision":"deny","reason":"..."}` |
| Shell no Windows | Git Bash (PowerShell sem ele) | não documentado; use `commandWindows` | `cmd /c` |
| Pasta de execução | a do projeto (`${CLAUDE_PROJECT_DIR}`) | a da sessão | a do `hooks.json` |
| Timeout padrão | 600 s | 600 s | 30 s |
| Aprovação do usuário | não | **sim, no `/hooks`; toda mudança exige nova aprovação** | não |

- Os três bloqueiam um comando de shell antes de ele rodar. Um script só, em Node, atende os três se reconhecer o formato
  da entrada e responder no formato de cada um.
- No Codex, um hook que trava, estoura o tempo ou devolve saída inválida **não bloqueia**; `ask` não é suportado.
- O Antigravity não tem `UserPromptSubmit`, `SessionEnd` nem `PreCompact`.

## Agentes personalizados

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Pasta | `.claude/agents/*.md`, `~/.claude/agents/` | `.codex/agents/*.toml`, `~/.codex/agents/` | `.agents/agents/*.md`, `~/.gemini/config/agents/` |
| Formato | Markdown + frontmatter (`name`, `description`, `tools`, `model`) | TOML (`name`, `description`, `developer_instructions`) | Markdown + frontmatter (`name`, `description`, `tools`, `model`) |

## Plugins

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Carrega rules | não | não | sim |
| Instalar | `claude plugin install <p>@<mkt>` | `codex plugin add <p>@<mkt>` | `agy plugin install <alvo>` |

O kit não é distribuído como plugin: rules não cabem em plugin no Claude Code nem no Codex. A instalação é pelo instalador.

## Pontos não confirmados

- Shell usado pelo Codex para o `command` de hooks no Windows.
- Nomes das ferramentas de edição no Antigravity (só `run_command` é documentado) e o efeito do exit code nos hooks dele.
- Pasta global do Antigravity CLI: os docs locais e esta máquina usam `~/.gemini/config/`; o site cita
  `~/.gemini/antigravity-cli/`.

## Fontes

- Claude Code: `code.claude.com/docs/en/` (`memory`, `skills`, `hooks`, `plugins`, `sub-agents`, `setup`).
- Codex: `learn.chatgpt.com/docs/` (`agents-md`, `rules`, `build-skills`, `hooks`, `codex/cli`) e `codex --help`.
- Antigravity: skill `agy-customizations` embutida no CLI, `antigravity.google/docs/` (`rules`, `skills`, `hooks`,
  `plugins`, `subagents`) e `agy --help`.
