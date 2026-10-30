# vibecoding-devtools

Kit de rules, skills, hooks e modelos para desenvolvimento com IA em Claude Code, Codex e Antigravity. O esforço acompanha
o risco: trocar um ícone leva minutos; mexer com dinheiro, contas ou segredos recebe contrato, testes e revisões.

O kit integra o [ECC](https://github.com/affaan-m/ECC) e o [Impeccable](https://github.com/pbakaus/impeccable), instalados
das fontes oficiais.

> **Estado:** versão inicial. O instalador ainda não existe; a especificação está em [`docs/instalador.md`](docs/instalador.md).

## Conteúdo

| Pasta | O que tem |
|---|---|
| [`rules/`](rules/) | `base`, `processo-por-risco`, `testes`, `modelos-por-risco`, `contexto-sob-demanda` e `maestri-protocolo` |
| [`skills/`](skills/) | `triagem-de-risco`, `revisao-de-seguranca` e, para quem usa o Maestri, `maestri-protocol` e `maestri-agent-cli` |
| [`templates/`](templates/) | `AGENTS.md` e `CLAUDE.md` para projetos, e `.coderabbit.yaml` |
| [`hooks/`](hooks/) | hooks planejados |
| [`docs/`](docs/) | [compatibilidade entre as CLIs](docs/compatibilidade-clis.md) e [instalador](docs/instalador.md) |

## Licença

[MIT](LICENSE).
