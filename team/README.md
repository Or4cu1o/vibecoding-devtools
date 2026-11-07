# Web development team

A permanent multi-agent team for the Maestri canvas: one Maestro and twelve specialists for web apps, APIs,
automations, bots and services. This folder is the versioned source of the team. Maestri holds the live copy as global
roles and the global partitura `vibecoding-devtools`.

## Layout

| Path | Content |
|---|---|
| `roles/<role>.md` | Role prompt of each agent, without the shared block |
| `roles/_team-protocol.md` | Block appended to every role when it is installed |
| `notes/team-roster.md` | Permanent `Team Roster` note: agents, pools, topology, approvals, contingencies |
| `notes/project-context/*.md` | Blank pages of the `Project Context` fichário, filled per project |
| `team.json` | Manifest: agents, launch commands, colors, ropes, notes, portal and partitura |
| `settings/task-runner-limited.json` | Antigravity session allowlist for the Task Runner; installed as a file in `~/.vibecoding-devtools/team/` |
| `partitura/vibecoding-devtools.maestripartitura` | Export of the partitura from the Maestri app: roles, commands, notes, portal, ropes |

The prompts rely on the kit rules (`base`, `risk-process`, `testing`, `maestri-messaging`) and the
`maestri-protocol`, `risk-triage`, `security-surfaces`, `maestri-agent-cli` and `maestri-budget` skills, installed for
every CLI by the kit installer; they do not repeat them.

## Agents

| Agent | Role | Launch command |
|---|---|---|
| Regente | Team Maestro | preset `Team Maestro` (Maestro on): `claude --model claude-opus-5-5 --effort high --permission-mode auto --add-dir ../../..` |
| Vitral | Frontend Engineer | `claude --model claude-sonnet-5-5 --effort high --permission-mode auto --add-dir ../../..` |
| Bússola | UX/UI Designer | `claude --model claude-opus-5-5 --effort high --permission-mode auto --add-dir ../../..` |
| Alicerce | Backend Architect | `claude --model claude-sonnet-5-5 --effort high --permission-mode auto --add-dir ../../..` |
| Sentinela | AppSec Auditor | `claude --model claude-opus-5-5 --effort medium --permission-mode auto --add-dir ../../.. --disallowedTools Edit Write NotebookEdit` |
| Crivo | Code Reviewer | same as Sentinela |
| Guindaste | DevOps Engineer | `claude --model claude-sonnet-5-5 --effort medium --permission-mode auto --add-dir ../../..` |
| Forja | Backend Engineer | `codex --no-daemon --approve-for-me -m gpt-6.1-sol -c model_reasoning_effort=medium --add-dir ../../..` |
| Ensaio | QA Engineer | same as Forja |
| Aquarela | Visual Asset Designer | `codex --no-daemon --approve-for-me -m gpt-6.1-sol -c model_reasoning_effort=low --add-dir ../../..` |
| Retina | Visual QA Inspector | `agy --model gemini-4-argon-medium --effort medium --mode auto --add-dir ../../..` |
| Sonda | Research Analyst | `agy --model gemini-4-argon-high --effort high --mode auto --add-dir ../../..` |
| Formiga | Task Runner | `agy --model gemini-3.8-flash-medium --effort medium --mode accept-edits --add-dir ../../.. --settings <file>` |

- Recruits start in `<workspace>/.maestri/roles/<id>/`, so `--add-dir ../../..` always points at the workspace root.
  Every Claude command has it too. It is variadic: keep it before `--disallowedTools` or last. The preset
  `Team Maestro` (its own name, so the kit never creates or changes a generic preset such as `Maestro Opus High`)
  carries it as well; start a Maestro with it from a role folder, since from the workspace root `../../..` points
  three folders above it.
- `<file>` is `task-runner-limited.json` in `~/.vibecoding-devtools/team/` (a path, quoted if it has spaces), written by
  `team` from `settings/task-runner-limited.json`: a stable path that does not depend on the npx cache and works in
  POSIX shells and PowerShell. Commands outside its allowlist prompt.
- Model ids change: check `codex debug models` and `agy models` before reusing a command.

## Topology

Regente connects to every agent. Peer ropes: Vitral with Bússola, Alicerce, Ensaio, Crivo and Retina; Bússola with
Retina and Aquarela; Alicerce with Forja, Guindaste and Sentinela; Forja with Ensaio, Crivo and Sentinela; Guindaste
with Sentinela and Crivo. Sonda and Formiga talk only to Regente. `Team Roster` is wired to Regente; the
`Project Context` fichário to Regente and every agent except Sonda, Aquarela and Formiga; the `Gemini` portal to
Aquarela.

## Install

Run on the machine where the agent CLIs run, from a Maestri terminal in Maestro mode. Maestri itself may run on another
computer (see [Maestri on a remote machine](../docs/maestri-remote.md)).

```bash
npx vibecoding-devtools team --dry-run      # preview the maestri commands
npx vibecoding-devtools team --roles-only   # create or update the global roles
npx vibecoding-devtools team                # also preset, agents, ropes, notes, portal and partitura
```

`team/team.json` is the manifest the command reads. Before running any `maestri` command, also with `--dry-run`, it
checks read-only that everything the launch commands need exists, lists what is missing together and stops with exit 1:

- each CLI on `PATH` (`maestri`, `claude`, `codex`, `agy`);
- each Codex model in `codex debug models` and each Antigravity model in `agy models`; Claude models are not checked,
  since there is no offline list;
- ECC in Claude Code (`claude plugin list` shows `ecc@`), because the Team Maestro role uses `/ecc:plan`.

`--roles-only` launches nothing and needs only `maestri`. Then, before changing anything, it stops on conflicts: a role
with other text, a preset with another command or Maestro setting, a Task Runner settings file with other content (each
replaced with `--update-roles`), and an agent you reach with another role. It writes the settings file when missing,
leaves identical roles and files alone and skips agents, notes and the portal you already reach and a partitura that
already has the name. `--dry-run` prints `write <path>` for the file and writes nothing. Then answer each agent's
startup prompts and sign in to Gemini in the portal.

### Resume after a failure

The run is safe to repeat. If a step fails midway (a recruit that errors, a lost connection), the command prints the
`maestri` error, the step it stopped at and `Run the same command again to resume`. Running the same command again
skips what exists (roles, preset, settings file, agents, notes, portal, partitura), `maestri connect` on an existing
rope prints `already connected` and exits 0, and the rest is created. A conflict or a missing prerequisite still stops
before any change.

Without the CLI, import `partitura/vibecoding-devtools.maestripartitura` in the Maestri app. The file carries the 13
role prompts with the team protocol, the launch commands, the notes and the portal, matching `roles/`, `notes/` and
`team.json`; it holds no chat history.

## Check

After an install, as the Maestro (Regente) or the installer:

1. `npx vibecoding-devtools team --dry-run` prints only `connect` lines: roles, preset, agents, notes, portal and
   partitura match the kit.
2. Each agent's screen shows its model and effort, and the expected mode (`auto mode on`, `Workspace [...] (Approve for
   me)` in Codex `/status`, `auto` or `accept-edits` in Antigravity).
3. Regente sends one `maestri ask --batch` with a ref to every agent asking, without changing files, for its role in
   one line, its working folder and writable project root, the first line of `Requirements` when `Project Context` is
   wired to it, and whom it reports to. Every answer matches its role and the topology above.
4. One peer exchange works, for example Vitral asks Bússola where the design system lives and relays the answer.

## Use in a project

Insert the partitura into the project's workspace, from the Maestri palette or as a Maestro:

```bash
maestri partitura insert "vibecoding-devtools"
```

Then fill the instance block of `Requirements` with Regente. The portal keeps the browser session of the computer
running Maestri; sign in to Gemini there once.

## Update

Edit the role files or `team.json`, then run `npx vibecoding-devtools team --roles-only --update-roles` to rewrite the
installed roles that differ. A full `team --update-roles` also replaces the Maestro preset with `maestri preset set`
when its command changed, and the Task Runner settings file when its content changed.
Maestri restarts the agents that use a rewritten role, and their chat context is lost: run it between tasks.
Agents already recruited keep the command they were launched with (the preset command applies to new terminals only).
To apply a changed command, run `maestri recruit --replace "<agent>" --command "<command>"` for that agent between
tasks, with the command from the table above and, for Formiga, the path of the settings file. Save the partitura again
with `maestri partitura update "vibecoding-devtools" <agents> --without-me` when agents, ropes or notes change, then
export it again from the Maestri app over `partitura/vibecoding-devtools.maestripartitura`.

## Known limits

- Maestri roles have no color; tier colors are listed in `Team Roster`.
- Sentinela and Crivo lose the Edit and Write tools only; the shell can still write, so read-only is role-enforced.
- Codex runs in the workspace-write sandbox without shell network by default; installs ask for approval.
- Gemini images captured through the portal are rendered pixels: no transparency, possibly below the original size.
  Downloads from the portal land on the computer running Maestri, not on the server.
