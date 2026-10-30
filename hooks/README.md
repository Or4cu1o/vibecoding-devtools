# Hooks: ideias para avaliar

Nada aqui está implementado. Critério para entrar: custo baixo por execução. Um hook que roda a cada prompt e injeta texto
gasta tokens em toda conversa; prefira hooks que só rodam um comando e bloqueiam ou avisam.

1. **Segredo no commit** (`PreToolUse` em `git commit`): roda `gitleaks git --staged` e bloqueia se achar segredo. Custo em
   tokens: zero.
2. **Suíte completa local** (`PreToolUse` em Bash): avisa quando o agente roda a suíte inteira (`pytest` sem caminho,
   `pnpm test` sem filtro) num repositório com CI, lembrando de rodar só os testes do que mexeu.
3. **Proporção de testes** (antes do push): compara as linhas de teste e de produção do diff. Acima de um limiar, avisa que
   um item Baixo ou Médio pode estar com teste demais.

Referência: hooks do Claude Code em `settings.json` (`PreToolUse`, `PostToolUse`, `SessionStart`).
