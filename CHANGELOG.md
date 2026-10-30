# Changelog

Mudanças relevantes do vibecoding-devtools. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/);
versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.0.1] - 2026-10-29

### Adicionado

- `README.md` com o conteúdo do kit.
- Rules: `base`, `processo-por-risco`, `testes`, `modelos-por-risco`, `contexto-sob-demanda` e `maestri-protocolo`.
- Skills: `triagem-de-risco`, `revisao-de-seguranca` (superfícies dinheiro e valores, contas e dados, entradas e serviços,
  segredos e infraestrutura), `maestri-protocol` e `maestri-agent-cli` (referências para Antigravity, Claude Code e Codex).
- Modelos em `templates/`: `.coderabbit.yaml`, `AGENTS.md` (roteamento e mapa de risco) e `CLAUDE.md` que importa o
  `AGENTS.md`.
- Ideias de hooks em `hooks/README.md`, incluindo a validação do cabeçalho do protocolo Maestri.
- `docs/compatibilidade-clis.md`: como Claude Code, Codex e Antigravity carregam instruções, rules, skills, hooks e agentes.
- `docs/instalador.md`: especificação do instalador.

### Alterado

- Licença de GPL-2.0 para MIT.
- Achados de revisão passam a usar Crítico, Maior, Menor e Sugestão; Baixo, Médio e Alto ficam só para o risco da tarefa.
  A regra de bloqueio fica só na `processo-por-risco`.
