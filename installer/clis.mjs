// Supported CLI binaries, official installation directories and installation commands.
// Source: docs/cli-compatibility.md, Binary and installation section.

export const CLIS = [
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    directories: {
      unix: ["~/.local/bin"],
      win: ["%USERPROFILE%\\.local\\bin", "%LOCALAPPDATA%\\Microsoft\\WinGet\\Links"],
    },
    install: {
      unix: "curl -fsSL https://claude.ai/install.sh | bash",
      win: "irm https://claude.ai/install.ps1 | iex",
    },
  },
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    directories: {
      unix: ["~/.local/bin"],
      win: ["%LOCALAPPDATA%\\Programs\\OpenAI\\Codex\\bin"],
    },
    install: {
      unix: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      win: "irm https://chatgpt.com/codex/install.ps1 | iex",
    },
  },
  {
    id: "agy",
    name: "Antigravity",
    bin: "agy",
    directories: {
      unix: ["~/.local/bin"],
      win: ["%LOCALAPPDATA%\\agy\\bin"],
    },
    install: {
      unix: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      win: "irm https://antigravity.google/cli/install.ps1 | iex",
    },
  },
];

export const NODE_MINIMUM = 22;
