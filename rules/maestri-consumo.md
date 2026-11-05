# Consumo no Maestri

Vale só quando você é o Maestro no Maestri e coordena outros agentes. Os detalhes estão na skill `maestri-budget`.

- Leia cota e contexto dos agentes só em checkpoint (início da sessão, início ou fim de tarefa grande, aviso de limite),
  carregando a skill `maestri-budget`. Fora disso, decida pelo seu `ledger.md`.
- Resultado de agente em modelo leve (como o Gemini Flash) é verificado antes de ser aceito ou relatado.
- Modelo, esforço e configuração de um agente mudam só a pedido do usuário ou num agente Antigravity marcado como
  gerenciado, e só entre tarefas.
- Antes de uma tarefa sem relação com a anterior, limpe o contexto do agente (comando na referência da CLI dele). Nunca
  compacte nem limpe um agente no meio de uma tarefa.
