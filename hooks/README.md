# Hooks: ideias para avaliar

Nada aqui está implementado. Critério para entrar: custo baixo por execução. Um hook que roda a cada prompt e injeta texto
gasta tokens em toda conversa; prefira hooks que só rodam um comando e bloqueiam ou avisam.

1. **Segredo no commit** (`PreToolUse` em `git commit`): roda `gitleaks git --staged` e bloqueia se achar segredo. Custo
   em tokens: zero.
2. **Suíte completa local** (`PreToolUse` em Bash): avisa quando o agente roda a suíte inteira (`pytest` sem caminho,
   `pnpm test` sem filtro) num repositório com CI, lembrando de rodar só os testes do que mexeu.
3. **Proporção de testes** (antes do push): compara as linhas de teste e de produção do diff. Acima de um limiar, avisa que
   um item Baixo ou Médio pode estar com teste demais.
4. **Cabeçalho do protocolo Maestri** (`PreToolUse` em `maestri ask`, sem `--raw`): bloqueia a mensagem a outro agente que
   não comece com `~ <Nome> | <STATUS> | <ref> | <resumo>` e devolve o motivo, para o agente corrigir e reenviar. Só no
   pacote Maestri.

## Como serão escritos

- Em Node, um script por hook, sem `npx` nem dependências pesadas dentro do hook.
- O mesmo script atende Claude Code, Codex e Antigravity: reconhece o formato da entrada e responde no formato de cada CLI.
  Os três bloqueiam um comando de shell antes de ele rodar; os detalhes (ferramenta, campo do comando, como bloquear) estão
  em `docs/compatibilidade-clis.md`, seção Hooks.
- No Codex, cada hook precisa ser aprovado pelo usuário no `/hooks`, e toda mudança no hook pede nova aprovação.
