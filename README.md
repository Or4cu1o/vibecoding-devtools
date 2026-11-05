# vibecoding-devtools

Kit de rules, skills, hooks e modelos para desenvolvimento com IA em Claude Code, Codex e Antigravity. O esforço
acompanha o risco: trocar um ícone leva minutos; mexer com dinheiro, contas ou segredos recebe contrato, testes e
revisões.

O kit integra o [ECC](https://github.com/affaan-m/ECC) e o [Impeccable](https://github.com/pbakaus/impeccable),
instalados das fontes oficiais.

## Instalação

```bash
npx github:Or4cu1o/vibecoding-devtools#v<versão>              # painel
npx github:Or4cu1o/vibecoding-devtools#v<versão> --dry-run    # só mostra o plano
npx github:Or4cu1o/vibecoding-devtools#v<versão> desinstalar  # remove só o que o kit instalou
```

O instalador detecta Claude Code, Codex e Antigravity, mostra o plano e só grava depois da confirmação. Detalhes em
[`docs/instalador.md`](docs/instalador.md).

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
