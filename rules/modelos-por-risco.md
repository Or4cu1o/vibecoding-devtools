# Modelos por função e risco

**Problema que resolve:** usar o modelo mais caro para tudo, ou o mais barato onde há dinheiro. **Custo que evita:** tokens
de modelo profundo em tarefa mecânica. **Revisão desta regra:** a cada troca de geração de modelos.

Os nomes dos modelos mudam; a regra fala em faixas. O mapa concreto (qual modelo é cada faixa hoje) fica no projeto ou na
configuração do orquestrador.

| Faixa | Para quê | Exemplos |
|---|---|---|
| **Rápida** | trabalho mecânico e de alto volume, nível Baixo | docs, CHANGELOG, formatação, renomeações, triagem rápida antes de decidir quem executa |
| **Padrão** | implementação e revisão do dia a dia, nível Médio | backend, frontend, correção de bug, revisão de código e de segurança |
| **Profunda** | planejamento e decisões caras de errar, nível Alto | arquitetura, contratos entre apps, esquema de dados de dinheiro, diagnóstico de falha que resistiu |

- **Dinheiro, autenticação e segurança nunca na faixa rápida**, nem na revisão.
- **Escalonamento:** a mesma tarefa falhou duas vezes com a mesma abordagem, suba uma faixa para replanejar em vez de
  insistir.
- **Segunda opinião** (outro fornecedor ou modelo mais barato): trate como sugestão. Se ela for usada em algo de nível
  Alto, a validação é feita por um modelo da faixa profunda.
- **Frontend com julgamento visual:** o modelo que o projeto validou para design; até validar, a faixa padrão.
