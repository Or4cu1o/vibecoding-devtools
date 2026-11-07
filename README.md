# vibecoding-devtools

Kit de rules, skills, hooks e modelos para desenvolvimento com IA em Claude Code, Codex e Antigravity. O esforço
acompanha o risco: trocar um ícone leva minutos; mexer com dinheiro, contas ou segredos recebe contrato, testing e
revisões.

O kit integra o [ECC](https://github.com/affaan-m/ECC) e o [Impeccable](https://github.com/pbakaus/impeccable),
instalados das fontes oficiais.

## Instalação

```bash
npx vibecoding-devtools@1.0.2 install    # instala pelo painel
npx vibecoding-devtools@1.0.2 update     # reutiliza as escolhas salvas
npx vibecoding-devtools@1.0.2 uninstall  # remove só o que o kit instalou
```

Alternativa pelo GitHub: `npx github:Or4cu1o/vibecoding-devtools#v1.0.2 install` (aceita os mesmos comandos).

Requer Node 22+ e git. O instalador detecta Claude Code, Codex e Antigravity, mostra o plano e só grava depois da
confirmação. Use `--dry-run` para apenas conferir o plano. Detalhes no [guia do instalador](docs/installer.md).

## Conteúdo

| Pasta | O que tem |
|---|---|
| [`rules/`](rules/) | regras de risco, testes, modelos, contexto e uso do Maestri |
| [`skills/`](skills/) | triagem de risco, revisão de segurança e operação do Maestri |
| [`templates/`](templates/) | `AGENTS.md` e `CLAUDE.md` para projetos, e `.coderabbit.yaml` |
| [Hooks](hooks/README.md) | `secret-scan`, `maestri-protocol` e `full-suite` implementados |
| [`team/`](team/README.md) | equipe de 13 agentes para o Maestri (roles, notas, partitura `vibecoding-devtools`), instalada com `npx vibecoding-devtools team` |
| [`docs/`](docs/) | instalação, compatibilidade, Maestri em máquina remota e justificativas das regras |

O `secret-scan` verifica segredos com gitleaks antes de commits. O `maestri-protocol` valida mensagens e exige o pacote
Maestri. O `full-suite` aplica um bloqueio contornável a suítes completas em repositórios com CI; para uma execução
intencional, inclua `VIBECODING_FULL_SUITE=1` no comando.

No escopo de projeto, os hooks são copiados para `.vibecoding-devtools/hooks/` dentro do repositório e registrados nos
arquivos de projeto de cada CLI. Versione esses arquivos para toda a equipe receber os hooks. No Codex, cada pessoa
os aprova uma vez em `/hooks`; mudanças nos hooks exigem nova aprovação.

Consulte a [compatibilidade entre as CLIs](docs/cli-compatibility.md) e as
[justificativas das regras](docs/rules-rationale.md).

## Licença

[MIT](LICENSE).
