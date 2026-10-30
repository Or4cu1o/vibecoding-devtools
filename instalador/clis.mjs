// CLIs suportadas: binário, pastas onde os instaladores oficiais costumam pôr o binário e comando oficial de instalação.
// Fonte: docs/compatibilidade-clis.md, seção "Binário e instalação".

export const CLIS = [
  {
    id: "claude",
    nome: "Claude Code",
    bin: "claude",
    pastas: {
      unix: ["~/.local/bin"],
      win: ["%USERPROFILE%\\.local\\bin", "%LOCALAPPDATA%\\Microsoft\\WinGet\\Links"],
    },
    instalar: {
      unix: "curl -fsSL https://claude.ai/install.sh | bash",
      win: "irm https://claude.ai/install.ps1 | iex",
    },
  },
  {
    id: "codex",
    nome: "Codex",
    bin: "codex",
    pastas: {
      unix: ["~/.local/bin"],
      win: ["%LOCALAPPDATA%\\Programs\\OpenAI\\Codex\\bin"],
    },
    instalar: {
      unix: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      win: "irm https://chatgpt.com/codex/install.ps1 | iex",
    },
  },
  {
    id: "agy",
    nome: "Antigravity",
    bin: "agy",
    pastas: {
      unix: ["~/.local/bin"],
      win: ["%LOCALAPPDATA%\\agy\\bin"],
    },
    instalar: {
      unix: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      win: "irm https://antigravity.google/cli/install.ps1 | iex",
    },
  },
];

export const NODE_MINIMO = 22;
