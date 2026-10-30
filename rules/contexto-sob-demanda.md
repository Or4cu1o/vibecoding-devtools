# Contexto sob demanda

**Problema que resolve:** regras grandes carregadas em toda conversa, mesmo quando a tarefa não toca o tema. **Custo que
evita:** tokens de contexto em cada mensagem de cada agente.

- O `CLAUDE.md` e o `AGENTS.md` do projeto são uma **tabela de roteamento**: "se a tarefa envolve X, leia o arquivo Y".
  Regras curtas e sempre válidas ficam ali mesmo; regras grandes ficam em arquivo próprio e só são lidas quando a tarefa
  toca o tema.
- Regra com carga automática por caminho (`paths:` no frontmatter) só para padrões estreitos. Um padrão como `**/*.py`
  carrega a regra em quase toda tarefa; nesse caso prefira a tabela ou uma skill.
- Checklists longos usados só em nível Alto viram **skill**: só a descrição fica no contexto, e o corpo carrega quando é
  usado.
- **Uma fonte só** para Claude Code e para os outros agentes (Antigravity, Codex). Duas cópias à mão (`.claude/rules` e
  `.agents/rules`) divergem com o tempo; gere uma a partir da outra.
- Documentação oficial de plataformas que mudam (Discord, provedores de pagamento) fica clonada ou referenciada no
  repositório e é consultada antes de assumir comportamento de memória.
- Mapa de risco do projeto na mesma tabela: quais pastas são nível Alto (dinheiro, contas, dados, segredos, deploy).
