# vibecoding-devtools

Kit de rules, skills, hooks e modelos para desenvolvimento com IA em Claude Code, Codex e Antigravity. O esforço
acompanha o risco: trocar um ícone leva minutos; mexer com dinheiro, contas ou segredos recebe contrato, testes e
revisões.

O kit integra o [ECC](https://github.com/affaan-m/ECC) e o [Impeccable](https://github.com/pbakaus/impeccable),
instalados das fontes oficiais.

> **Estado:** versão inicial. Do instalador, só a detecção existe (`node instalador/cli.mjs detectar`); o resto está
> especificado em [`docs/instalador.md`](docs/instalador.md).

## Conteúdo

| Pasta | O que tem |
|---|---|
| [`rules/`](rules/) | `base`, `processo-por-risco`, `testes`, `modelos-por-risco`, `contexto-sob-demanda` e, para quem usa o Maestri, `maestri-protocolo` e `maestri-consumo` |
| [`skills/`](skills/) | `triagem-de-risco`, `revisao-de-seguranca` e, para quem usa o Maestri, `maestri-protocol`, `maestri-agent-cli` e `maestri-budget` |
| [`templates/`](templates/) | `AGENTS.md` e `CLAUDE.md` para projetos, e `.coderabbit.yaml` |
| [`hooks/`](hooks/) | hooks planejados |
| [`docs/`](docs/) | [compatibilidade entre as CLIs](docs/compatibilidade-clis.md) e [instalador](docs/instalador.md) |

## Licença

[MIT](LICENSE).
