# Installer

vibecoding-devtools installer specification. All five stages are implemented and tested on Linux and Windows.

| Stage | Status |
|---|---|
| 1. Node, git, gitleaks, CLIs, PATH and stack detection (`node installer/cli.mjs detect`) | done |
| 2. Panel and flags (`install`, `--dry-run`, `--yes`) | done |
| 3. Kit installation, with conversions | done |
| 4. ECC and Impeccable | done |
| 5. State and `uninstall` | done |

One command prepares the AI development environment end to end: checks what exists on the machine, opens a panel to
choose what to install, and installs the kit and Impeccable on selected CLIs, plus ECC on Claude Code and Codex. The kit
is distributed only through the installer, never as a plugin (see `docs/cli-compatibility.md`, Plugins section).

## Decisions

- **Language:** Node ≥ 22, for the installer and hooks. ECC and Impeccable already install through `npx`, so Node is a
  prerequisite anyway, and on Windows `python3` may just be the Microsoft Store shortcut.
- **Panel:** `@clack/prompts`. Dependencies are pinned in `npm-shrinkwrap.json`, which `npx` respects.
- **Supported CLIs:** Claude Code, Codex and Antigravity. Claude Code is the source; the others receive conversions.
- **Scope:** global by default (applies to every project); the user can choose project scope in the panel.
- **Third parties:** ECC and Impeccable come from official sources, at versions pinned in `installer/third-party.json`.
  The kit does not store copies of their code.
- **ECC rules:** our installer copies them for Claude Code and Codex from the pinned ECC version. The ECC installer
  installs the rest on Claude Code (agents, commands, skills and optional hooks), without the rules module; Codex uses
  the plugin. ECC is not installed on Antigravity.
- **Impeccable telemetry:** disabled by default (`DO_NOT_TRACK=1` and `npx impeccable@4.8.0 telemetry off`).
- **Third-party hooks:** ECC and Impeccable hooks are disabled by default; the panel asks.
- **Kit hooks:** secret scanning is on by default; the panel and `--hooks` control installation. The protocol hook
  also requires the Maestri pack. Codex users approve hooks in `/hooks`.
- **Maestri:** only by panel selection or the `--maestri` flag.
- **Maintenance:** `update` and `uninstall` use the state recorded at installation (see Maintenance below).

## Entry point

`npx vibecoding-devtools@1.1.0` downloads the pinned npm release and runs the installer. As an alternative,
`npx github:Or4cu1o/vibecoding-devtools#v1.1.0` downloads the repository at the pinned tag and runs the same installer.
Both forms accept the same commands and flags. See [releasing](releasing.md) for trusted publishing and provenance.
No `curl | bash`: the installer only **displays** the official installation command for an absent CLI, never executes
it.

```bash
npx vibecoding-devtools@1.1.0 install     # panel
npx vibecoding-devtools@1.1.0 uninstall   # removes only what the kit installed
npx vibecoding-devtools@1.1.0 update      # updates using saved choices
```

## Flow

1. **Prerequisites:** Node ≥ 22 and git; if missing, explains how to install and stops. gitleaks is recommended (rules
   require scanning before commits): if missing, warns and continues.
2. **CLIs:** looks for `claude`, `codex` and `agy`; shows version and folder. Installed but outside `PATH`: says which
   folder to add. Installed but not responding to `--version`: reports an error. Missing: offers the official install
   command (table in `docs/cli-compatibility.md`).
3. **Project:** when running inside a repository, detects the stack from files (`package.json`, `tsconfig.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `composer.json`, `Gemfile`...) to suggest ECC rules.
4. **Panel:**
   - Target CLIs (detected ones are selected).
   - Scope: global or project.
   - Kit: rules, skills and hooks; secret scanning by default, protocol checks only with the Maestri pack.
   - ECC: which CLIs (Claude Code or Codex); ECC hooks (disabled by default); project stack rule packages.
   - Impeccable: which CLIs.
   - Maestri: install the `maestri-messaging` and `maestri-usage` rules and the `maestri-protocol`, `maestri-agent-cli`
     and `maestri-budget` skills?
5. **Summary:** lists each file and command to run (dry-run) and asks for confirmation.
6. **Installation:** third parties first, then the kit. Stops on any error, never leaving an incomplete install
   silently.
7. **State:** records what was installed and where (`~/.vibecoding-devtools/state.json`), to uninstall and update only
   what belongs to the kit.
8. **Report:** what was installed on each CLI and what remains for the user (for example, approving hooks in Codex's
   `/hooks`).

Without the panel: the same choices through flags and `--yes`, for reinstalling or running in CI (`--help` lists flags).
Exit codes: `0` success; `1` something skipped, blocked or failed; `2` usage error.

## Architecture

The installer builds a **plan** (list of actions) from choices and detection, shows the plan and only then executes it.
Building the plan writes nothing, enabling dry-run, tests and uninstall. One owner per file:

| File | Responsibility |
|---|---|
| `detect.mjs` | Stage 1: Node, git, gitleaks, CLIs, PATH and stack (done). |
| `convert.mjs` | Pure functions: Claude Code rules to Antigravity (`trigger:`), rules to the Codex block. |
| `plan.mjs` | `buildPlan(choices, detection, paths)`: returns actions without writing. |
| `third-party.mjs` and `third-party.json` | Pinned ECC and Impeccable versions and install/uninstall commands; fetch ECC at its tag to copy rules. |
| `state.mjs` | Read and write `~/.vibecoding-devtools/state.json`. |
| `execute.mjs` | Apply the plan (or only list, in dry-run), record state and uninstall from state. |
| `panel.mjs` | `@clack/prompts` panel and the same choices through flags without the panel. |
| `cli.mjs` | Commands `detect`, `install` (default), `update`, `uninstall`; flags `--dry-run`, `--yes`, `--json`. |

**Plan actions**, each with `owner` (`kit`, `ecc` or `impeccable`) and `cli`:

- `copy`: `source` to `destination` (file or folder).
- `write`: `content` to `destination`.
- `block`: `content` between markers `<!-- vibecoding-devtools:start -->` and `<!-- vibecoding-devtools:end -->` in
  `destination`, leaving the rest of the file untouched.
- `command`: `cmd` with `args` (list, never a shell string), in `cwd`, with extra `env`.

**Already installed items** (read during detection, before the plan):

- Kit: version and items from `state.json`, if present.
- Skills with the same name in each CLI's folders, installed from another source.
- Each CLI's plugins (`claude plugin list`, `codex plugin list`, `agy plugin list --json`), to find ECC or Impeccable
  installed as plugins.
- ECC and Impeccable installed through `npx`: each one's installation state and version.

The plan then marks each action as **new**, **same** (skip), **update** (kit or third-party item at another version) or
**conflict** (exists and does not belong to the kit: skip and warn). Failure or delay reading a CLI's plugins never
authorizes installation: the third party is blocked with a warning. A third party already installed by another method
(plugin instead of `npx`) is not installed again: the report names the active method.

**Execution rules:**

- Never overwrites a file it did not create: records a conflict in the report and skips, unless `--force`.
- Records each created file with its content hash, each block and each third-party command in state.
- Uninstall removes only state-recorded items unchanged since installation (matching hash); removes blocks; runs ECC's
  `uninstall`; lists what Impeccable created for user confirmation. Changed file: warns and keeps it.
- The entire user home comes from `paths.home` (and each CLI's folders derive from it), so tests run in a temporary
  folder.

**Choices** (returned by the panel or flags): target CLIs; scope (`global` or `project`, with root; flags `--scope` and
`--project`); kit hooks yes or no (`--hooks`); Maestri package yes or no; ECC (CLIs, hooks yes or no, stack packages);
Impeccable (CLIs).

## Maintenance

`install` saves the resolved choices in `~/.vibecoding-devtools/state.json`: kit CLIs, scope, project root for project
scope, Maestri, kit hooks, ECC CLIs/hooks/stack packages and Impeccable CLIs/hooks. Choices are recorded after
confirmation, including when every selected item is already identical. Dry runs and cancelled operations save nothing.
Choices remain available after a partial installation so the same selection can be retried.

Run `update` from the desired kit version to reuse those choices. It detects prerequisites, CLIs, stacks and installed
items again, builds a fresh plan from the kit being run, shows the same new/same/update/conflict situations as install,
and asks for confirmation. It does not resolve or download a newer kit release automatically. A saved project install
uses its recorded root even when update runs elsewhere. Missing saved choices, including older states that contain
only installed items, produce an error suggesting `install`.

Explicit flags override saved choices. `--project` or `--scope project` selects the current repository instead of the
saved root; `--scope global` selects global scope. List flags accept `none` to clear a selection. Use `--no-maestri`,
`--no-hooks`, `--no-ecc-hooks` or `--no-impeccable-hooks` to disable a saved option. Clearing a third-party CLI
selection also clears its hooks and stack packages; global scope clears project stack packages. Overrides are saved
when applied.
Update also shows **remove** for tracked kit-owned items absent from the new plan, including dropped files inside
copied folders, managed blocks and JSON hook entries. It uses the uninstall safeguards: unchanged items are removed;
edited items are retained with a warning and remain recorded for review or uninstall. `--force` does not override
this removal safeguard. Third-party items are never removed by update. Unrelated content and empty folders remain.

```bash
npx vibecoding-devtools@1.1.0 update --dry-run --json
npx vibecoding-devtools@1.1.0 update --yes
npx vibecoding-devtools@1.1.0 update --clis codex --no-maestri --yes
```

`update` supports `--dry-run`, `--json`, `--yes` and `--force` with the same safeguards and exit codes as install.
Without a TTY, applying requires `--yes`; JSON output also requires `--yes` to apply. Dry runs write nothing and do not
download ECC. `uninstall` continues to use item ownership and hashes, preserving changed files and unrelated content.

## What goes into each CLI

| Item | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Kit rules | `~/.claude/rules/vibecoding/` | marked block in `~/.codex/AGENTS.md` | `~/.gemini/config/rules/`, `trigger: always_on` |
| Global ECC rules | `common` and `web` in `~/.claude/rules/ecc/` | `common` in `~/.codex/vibecoding/ecc/`, read on demand | not installed |
| Stack rules (project) | `.claude/rules/ecc/<package>/` | project `AGENTS.md` row pointing to the package | not installed |
| Kit skills | `~/.claude/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/` |
| Kit hooks | `~/.claude/settings.json` | `~/.codex/hooks.json` (user approves in `/hooks`) | `~/.gemini/config/hooks.json` |
| Project template | `CLAUDE.md` with `@AGENTS.md` | `AGENTS.md` | `AGENTS.md` |
| Maestri command rules | not needed (auto mode) | `~/.codex/rules/vibecoding-devtools-maestri.rules`, global in either scope | not needed (auto mode) |
| GateGuard exemptions (with ECC) | `env.GATEGUARD_EXEMPT_GLOBS` in `~/.claude/settings.json`, either scope | not applicable | not applicable |

With the Maestri pack, Codex also gets command rules that let agents run the `maestri` commands they use for messaging,
notes and portals outside the sandbox without a human prompt, and forbid `maestri dismiss`, `note delete` and
`portal close`. They always go to the user's `~/.codex/rules/`, since every workspace's agents need them.

With ECC on Claude Code, the kit adds path globs to `GATEGUARD_EXEMPT_GLOBS` so ECC's GateGuard stops asking for facts
before agents write files with no import value: Claude Code's temp directory (scratchpad; `CLAUDE_CODE_TMPDIR` or
`/tmp`, then `claude-<uid>`, or `claude` on Windows), its auto memory (`~/.claude/projects/*/memory/`) and, with the
Maestri pack, `.maestri/` folders. The globs hold this machine's paths, so they always go to the user's settings. The
kit adds missing globs at the end of the existing value and leaves the rest of the value and file as they were.
Uninstall removes only the globs the kit added; globs the user already had stay. The exemptions apply even with ECC
hooks off, since the ECC plugin brings GateGuard on its own; without GateGuard the variable does nothing.

In project scope, rules, skills and templates go into the repository's `.claude/`, `.codex/`, `.agents/` and
`AGENTS.md`. Project hook scripts live in `.vibecoding-devtools/hooks/`; registrations live in the repository's
`.claude/settings.json`, `.codex/hooks.json` and `.agents/hooks.json`. Commit the runtime and registrations so everyone
who clones the repository gets the same hooks. Each Codex user must still trust the project and approve them in
`/hooks`.

- **Codex:** the limit is 32 KiB across all `AGENTS.md` files. Kit rules (about 12 KiB) go in full; ECC's `common`
  (about 18 KiB) would leave only 2 KiB for the project's `AGENTS.md`, so it lives in a separate file and the kit block
  says when to read it.
- **Antigravity:** always-on and global rules share 20 thousand tokens; only kit rules are installed, without ECC.
- **Rules with `paths:`** (kit, or ECC on Codex): on Antigravity, kit rules become `trigger: glob` with `globs:`;
  on Codex, a routing table row in the kit block.
- **ECC rules on Claude Code:** copy each package's entire folder to preserve `../common/` references.
- **Rules on Antigravity:** only the first level of `rules/` is read. No ECC packages are copied or flattened.

## Hooks

Copy scripts and `lib/` to `~/.vibecoding-devtools/hooks/` globally, or `.vibecoding-devtools/hooks/` in the repository
for project scope, running each hook with Node. Register `PreToolUse` handlers by merging JSON, identifying the kit's
entries by absolute or portable script reference and preserving existing user entries:

- Claude Code: `~/.claude/settings.json` globally or `.claude/settings.json` in project scope, `hooks.PreToolUse`,
  matcher `Bash|PowerShell`, timeout 30 seconds. Project commands resolve through `CLAUDE_PROJECT_DIR`, including when
  Claude Code starts a hook from a repository subfolder.
- Codex: `~/.codex/hooks.json` globally or `.codex/hooks.json` in project scope, `hooks.PreToolUse`, matcher `Bash`,
  with `commandWindows`. Each person approves hooks in `/hooks`, including after hook changes, and trusts the project
  layer.
  [Codex runs hooks from the session folder](https://learn.chatgpt.com/docs/hooks), which can be a subfolder. Project
  commands use a Node launcher to find the Git root and start the repository's script, preserving stdin and the exit
  code. The same command works in POSIX shells and Windows `commandWindows`; no machine paths enter the registration.
- Antigravity: `~/.gemini/config/hooks.json` globally or `.agents/hooks.json` in project scope, with enabled entries
  `vibecoding-secret-scan`, `vibecoding-full-suite` and
  `vibecoding-maestri-protocol`, matcher `run_command`, timeout 30 seconds.

Antigravity runs hook commands from the folder containing `hooks.json`, through `cmd /c` on Windows. Its commands use
unquoted relative paths with forward slashes, such as `node ../../.vibecoding-devtools/hooks/secret-scan.mjs` globally;
project commands use `node ../.vibecoding-devtools/hooks/secret-scan.mjs` from the repository's `.agents/` folder.
Registration is
refused if that relative path contains spaces or crosses Windows drives. A failing Antigravity hook **blocks the tool
call**, including a Node startup failure caused by a bad path. Quoted absolute paths can reach Node with literal quotes.

`secret-scan` checks commits with gitleaks; `full-suite` checks full test suite commands in repositories with CI;
`maestri-protocol` checks message headers and delegation footers, skipping raw input. Secret scanning and full-suite
checks are enabled by default; `--hooks`, `--no-hooks` and the panel question control both. The protocol hook is
included only with the Maestri pack. Unknown input or uncertain commands never block; missing or failing gitleaks only
warns. Scans run before command execution and cannot cover later file changes.
See [hooks](../hooks/README.md) for details.

Record hook files and JSON merges in installation state, with the same hash and conflict safeguards as other actions.
Update keeps full-suite with the saved hooks choice and adds its registrations to existing installs with hooks enabled.
Existing project installs migrate on update: unchanged tracked home scripts and registrations are removed, project
copies are added, and an earlier project Antigravity entry is replaced using its recorded ownership and hash.
Edited items remain with warnings or conflicts. Dropped project runtime files are removed using the normal update
safeguards. Global scope keeps its existing locations and commands.
Uninstall removes only the kit's registrations and unchanged installed files, preserving user content.

## ECC

- Pinned version: `ecc-universal@2.2.3` (tag `v2.2.3` at `github.com/affaan-m/ECC`).
- **Modules, no profile:** `minimal` and `core` profiles include `rules-core`, which would install rules again. The
  installer passes modules explicitly: `agents-core`, `commands-core`, `platform-configs` and `workflow-quality`, plus
  `hooks-runtime` only if the user enables ECC hooks (equivalent to `core` without rules).
- Claude Code: `npx ecc-universal@2.2.3 install --target claude --modules <modules>`, which records installed items and
  supports uninstall.
- Codex: native plugin (`codex plugin marketplace add affaan-m/ECC@v2.2.3` and `codex plugin add ecc@ecc`); hooks need
  approval in `/hooks`. The installer still copies and routes rules from the `common` package.
- Antigravity: ECC is not installed; no ECC commands, rules or flattening.
- **Never two methods for the same CLI** (plugin and `install`, for example): hooks would be duplicated.
- Precedence: kit rules state which ECC rules they replace (for example, `testing` replaces the 80% target and mandatory
  TDD). Project rules override both.

## Impeccable

- Pinned version: `impeccable@4.8.0` on npm (tag `cli-v4.8.0` at `github.com/pbakaus/impeccable`), in every command.
- `npx impeccable@4.8.0 install --providers=<claude,codex,antigravity> --scope=<project|global> -y`. Without a TTY,
  always
  pass `-y` and `--providers`, otherwise the command waits for input.
- In project scope, runs at the project root; globally, the user's home is the working folder (verified with 4.8.0,
  outside a git repository). No uninstall: the report lists what it created.
- On Antigravity, only the skill is installed, without a hook. Writes to `.agent/`; check that the skill does not load
  twice. Impeccable remains available on all three CLIs.

## Maestri team

`vibecoding-devtools team` installs the team in `team/` (see `team/README.md`) through the `maestri` CLI instead of
copying files: roles, presets, partituras and notes live in the Maestri app, which may run on another computer
([Maestri on a remote machine](maestri-remote.md)). It runs only from a Maestri terminal in Maestro mode and is not part
of `install`, `update` or the saved state. Before any `maestri` command, also with `--dry-run`, it checks read-only that
the CLIs, the Codex and Antigravity models in `team.json` and ECC in Claude Code exist, and stops with exit 1 listing
what is missing. It then checks for conflicts before any change (a role with other text, a preset with another command,
a Task Runner settings file with other content, an agent with another role) and leaves identical roles alone.
`--roles-only` creates the missing global roles and `--update-roles` rewrites what differs; the full run also writes the
Task Runner settings file to `~/.vibecoding-devtools/team/`, creates the Maestro preset, recruits what the caller does
not reach yet, wires the ropes, creates the notes and the portal, and saves the partitura when none has its name.
`--dry-run` prints the commands. A run that fails midway is resumed by running the same command again. Code:
`installer/team.mjs`; manifest: `team/team.json`.

## Check during implementation

- Multi-module `--modules` syntax and whether `agents-core` writes any `AGENTS.md` (run with `--dry-run`).
- Whether the ECC plugin on Codex brings its own rules.
