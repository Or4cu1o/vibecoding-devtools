<!--
Modelo de AGENTS.md do vibecoding-devtools. Copie para a raiz do projeto, preencha os <...> e apague o que não se aplica,
inclusive este comentário. Claude Code, Codex e Antigravity leem este arquivo; o CLAUDE.md do projeto tem só `@AGENTS.md`.

Limites: o Codex lê no máximo 32 KiB somando todos os AGENTS.md, e o Claude Code recomenda menos de 200 linhas. Este
arquivo é uma tabela de roteamento: o que vale sempre fica aqui, em poucas linhas; o resto fica em arquivo próprio e entra
na tabela "Antes de começar".
-->

# <Nome do projeto>

<Uma ou duas frases: o que o sistema faz e para quem.>

## Mapa

| App ou pasta | Papel | Stack | README |
|---|---|---|---|
| `<apps/api>` | <API pública> | <Python 3.13, FastAPI> | `<apps/api/README.md>` |
| `<apps/web>` | <painel web> | <TypeScript, Next.js> | `<apps/web/README.md>` |

- **Fronteiras:** <quem pode chamar quem; o que um app nunca importa de outro>.
- **Integrações externas:** <serviço → pasta do cliente → documentação oficial em `docs/vendor/<serviço>`>.

## Comandos

| Para | Comando |
|---|---|
| Instalar dependências | `<pnpm install>` |
| Rodar localmente | `<pnpm dev>` |
| Lint e typecheck | `<pnpm lint && pnpm typecheck>` |
| Testes de um caminho | `<pnpm test -- caminho>` |
| Build | `<pnpm build>` |

Localmente, rode só os testes do que mexeu; o CI roda a suíte completa.

## Mapa de risco

Vence a lista genérica da regra `processo-por-risco`. O arquivo mais arriscado da mudança decide o nível.

| Nível | Caminhos |
|---|---|
| **Alto** | `<apps/api/payments/**>`, `<apps/api/auth/**>`, `<migrations/**>`, `<.github/workflows/**>`, `<infra/**>` |
| **Médio** | `<apps/*/src/**>` fora dos caminhos Alto |
| **Baixo** | `<docs/**>`, `<**/*.md>`, `<public/**>` |

Áreas críticas com piso maior de cobertura: <liste ou escreva "nenhuma">.

## Antes de começar

| Se a tarefa envolve | Leia ou use |
|---|---|
| Qualquer tarefa de código | skill `triagem-de-risco` |
| Nível Alto | skill `revisao-de-seguranca`, só as superfícies tocadas |
| Testes | regra `testes` |
| Escolher modelo ou delegar | regra `modelos-por-risco` |
| <Integração com o serviço X> | `<docs/vendor/x/README.md>` |
| <Interface visual> | <skill de design do projeto> |

## Regras do projeto

Valem sempre e vencem as regras genéricas do kit e de terceiros (ECC). Só o que é próprio deste projeto:

- <Exemplo: todo valor em centavos, tipo `Money`; nunca `float`.>
- <Exemplo: textos de interface em pt-BR, código e commits em inglês.>

## Pronto

- <Critério do projeto além do CI verde, por exemplo: migração testada num banco com dados.>
- Mudou a estrutura, o papel ou o fluxo de um app: atualize o README dele no mesmo commit.
