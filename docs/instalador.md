# Instalador

Especificação do instalador do vibecoding-devtools. Ainda não implementado; a primeira versão que funcionar será a 0.1.0.

Um comando prepara o ambiente de desenvolvimento com IA de ponta a ponta: confere o que existe na máquina, abre um painel
para escolher o que instalar e instala o kit, o ECC e o Impeccable nas CLIs escolhidas. O kit é distribuído só pelo
instalador, nunca como plugin (veja `docs/compatibilidade-clis.md`, seção Plugins).

## Decisões

- **Linguagem:** Node ≥ 22, no instalador e nos hooks. ECC e Impeccable já se instalam por `npx`, então o Node é
  pré-requisito de qualquer forma, e no Windows o `python3` pode ser só o atalho da Microsoft Store.
- **Painel:** `@clack/prompts`. As dependências ficam fixadas em `npm-shrinkwrap.json`, que o `npx` respeita.
- **CLIs suportadas:** Claude Code, Codex e Antigravity. O Claude Code é a fonte; as outras recebem conversões.
- **Escopo:** global por padrão (vale em todo projeto); o usuário pode escolher por projeto no painel.
- **Terceiros:** ECC e Impeccable vêm da fonte oficial, na versão fixada em `instalador/terceiros.json`. O kit não guarda
  cópia do código deles.
- **Rules do ECC:** quem copia é o nosso instalador, nas três CLIs, a partir do ECC na versão fixada. O instalador do ECC
  instala o resto (agentes, comandos, skills e, se pedido, hooks), sem o módulo de rules.
- **Telemetria do Impeccable:** desligada por padrão (`DO_NOT_TRACK=1` e `npx impeccable telemetry off`).
- **Maestri:** só por escolha no painel ou pela flag `--maestri`.
- **Manutenção:** `uninstall` na 0.1.0; `update` depois. Os dois usam o estado gravado na instalação.

## Entrada

`npx github:Or4cu1o/vibecoding-devtools#v<versão>`: o npm baixa o repositório na tag e roda o instalador, sem publicar
pacote. A tag fixa a versão, como a superfície `segredos-e-infra` da skill `revisao-de-seguranca` exige para downloads.
Nada de `curl | bash`.

```bash
npx github:Or4cu1o/vibecoding-devtools#v0.1.0             # painel
npx github:Or4cu1o/vibecoding-devtools#v0.1.0 uninstall   # remove só o que o kit instalou
```

## Fluxo

1. **Pré-requisitos:** Node ≥ 22 e git. Faltando, explica como instalar e para.
2. **CLIs:** procura `claude`, `codex` e `agy`; mostra versão e pasta. Instalado mas fora do `PATH`: avisa e oferece o
   comando para corrigir. Ausente: oferece o comando oficial de instalação (tabela em `docs/compatibilidade-clis.md`).
3. **Projeto:** quando roda dentro de um repositório, detecta a stack pelos arquivos (`package.json`, `tsconfig.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `composer.json`, `Gemfile`...) para sugerir as rules do ECC.
4. **Painel:**
   - CLIs alvo (as detectadas vêm marcadas).
   - Escopo: global ou projeto.
   - Kit: rules, skills e hooks, cada hook ligável à parte.
   - ECC: em quais CLIs; hooks do ECC (desligados por padrão); pacotes de rules da stack no projeto.
   - Impeccable: em quais CLIs.
   - Maestri: instalar `maestri-protocolo`, `maestri-protocol` e `maestri-agent-cli`?
5. **Resumo:** lista cada arquivo e comando que vai rodar (dry-run) e pede confirmação.
6. **Instalação:** terceiros primeiro, depois o kit. Para em qualquer erro, sem deixar instalação pela metade sem aviso.
7. **Estado:** grava o que instalou e onde (`~/.vibecoding-devtools/estado.json`), para desinstalar e atualizar só o que
   é do kit.
8. **Relatório:** o que foi instalado em cada CLI e o que ficou para o usuário fazer (por exemplo, aprovar hooks no
   `/hooks` do Codex).

Modo sem painel: as mesmas escolhas por flags e `--yes`, para reinstalar ou rodar em CI.

## O que vai em cada CLI

| Item | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Rules do kit | `~/.claude/rules/vibecoding/` | bloco marcado em `~/.codex/AGENTS.md` | `~/.gemini/config/rules/`, `trigger: always_on` |
| Rules globais do ECC | `common` e `web` em `~/.claude/rules/ecc/` | `common` em `~/.codex/vibecoding/ecc/`, lida sob demanda | `common` em `~/.gemini/config/rules/`, `trigger: always_on` |
| Rules da stack (projeto) | `.claude/rules/ecc/<pacote>/` | linha no `AGENTS.md` do projeto apontando o pacote | `.agents/rules/`, `trigger: glob` |
| Skills do kit | `~/.claude/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/` |
| Hooks do kit | `~/.claude/settings.json` | `~/.codex/hooks.json` (usuário aprova no `/hooks`) | `~/.gemini/config/hooks.json` |
| Modelo de projeto | `CLAUDE.md` com `@AGENTS.md` | `AGENTS.md` | `AGENTS.md` |

No escopo de projeto, as mesmas peças vão para `.claude/`, `.codex/`, `.agents/` e `AGENTS.md` do repositório.

- **Codex:** o limite é 32 KiB somando todos os `AGENTS.md`. As rules do kit (cerca de 12 KiB) entram inteiras; a
  `common` do ECC (cerca de 18 KiB) deixaria só 2 KiB para o `AGENTS.md` do projeto, por isso fica num arquivo à parte e
  o bloco do kit diz quando lê-la.
- **Antigravity:** rules sempre ativas e globais dividem 20 mil tokens; kit e `common` somam cerca de 8 mil.
- **Rules do ECC:** copie a pasta inteira de cada pacote, não arquivos soltos, para manter as referências `../common/`.
  No Antigravity, rule com `paths:` vira `trigger: glob` com `globs:`.

## ECC

- Versão fixada: `ecc-universal@2.2.3` (tag `v2.2.3` em `github.com/affaan-m/ECC`).
- **Módulos, sem perfil:** os perfis `minimal` e `core` incluem `rules-core`, que instalaria as rules de novo. O
  instalador passa os módulos explicitamente: `agents-core`, `commands-core`, `platform-configs` e `workflow-quality`, e
  `hooks-runtime` só se o usuário ligar os hooks do ECC (o que equivale ao `core` sem rules).
- Claude Code: `npx ecc-universal@2.2.3 install --target claude --modules <módulos>`, que registra o que instalou e
  permite desinstalar.
- Codex: plugin nativo (`codex plugin marketplace add affaan-m/ECC` e `codex plugin add ecc@ecc`); os hooks pedem
  aprovação no `/hooks`.
- Antigravity: `npx ecc-universal@2.2.3 install --target antigravity --modules <módulos>`. É adaptador experimental, sem
  hooks, e grava no `.agents/` do projeto.
- **Nunca dois métodos para a mesma CLI** (plugin e `install`, por exemplo): os hooks duplicam.
- Precedência: as rules do kit dizem quais regras do ECC substituem (por exemplo, `testes` substitui a meta de 80% e o TDD
  obrigatório). As rules do projeto vencem as duas.

## Impeccable

- Versão fixada: `impeccable` (tag `cli-v4.8.0` em `github.com/pbakaus/impeccable`).
- `npx impeccable install --providers=<claude,codex,antigravity> --scope=<project|global> -y`. Sem TTY, passe sempre `-y`
  e `--providers`, senão o comando espera resposta.
- Precisa rodar na raiz de um projeto com git. Não tem desinstalação: o estado do instalador registra o que ele criou.
- No Antigravity entra só a skill, sem hook. Grava em `.agent/`, enquanto o ECC usa `.agents/`: confira se a skill não
  carrega duas vezes.

## Conferir na implementação

- Sintaxe de `--modules` com vários módulos e se `agents-core` escreve algum `AGENTS.md` (rodar com `--dry-run`).
- Se o plugin do ECC no Codex traz rules por conta própria.
