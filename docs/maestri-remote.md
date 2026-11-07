# Maestri on a remote machine

Maestri can run on one computer (for example, a Windows desktop) while its terminals connect over SSH to another
machine prepared for development, where the agent CLIs and this kit are installed. Verified on 2026-11-06 with the
Maestri app on Windows and Claude Code, Codex and Antigravity on Linux.

## Where each part lives

| Part | Lives on |
|---|---|
| Canvas, roles, presets, partituras, notes | The Maestri computer (the `maestri` CLI reaches them from any terminal) |
| Portals (embedded browser), their sign-ins and cookies | The Maestri computer |
| Agent CLIs, their logins, settings, skills and hooks | The development machine |
| The kit (`npx vibecoding-devtools`) and its `team` command | The development machine, from a Maestri terminal |
| Role folders `<workspace>/.maestri/roles/<id>/` | The development machine, inside each workspace |

## Consequences

- **Install the kit where the CLIs run.** `npx vibecoding-devtools team` creates roles and the partitura through the
  `maestri` CLI, so they land in the Maestri app on the other computer; run it from a Maestri terminal in Maestro mode.
- **Portal downloads go to the Maestri computer.** A download button in a portal opens a save dialog there, not on the
  development machine, and pages rarely let scripts read their images (CORS, signed URLs bound to the session).
  `maestri portal screenshot` does reach the development machine, under `/tmp/maestri-drops/`.
- **Capturing a generated image from a portal:** clone the image element with `maestri portal evaluate`, pin it at the
  top left at its natural size, take a screenshot and crop that region (Pillow through `uv run --with pillow`). The
  result is rendered pixels: no transparency, possibly below the original resolution. Never extract session cookies
  to download the file.
- **Sign-ins are human steps** on the Maestri computer (portals) or in each agent terminal (CLI logins).
