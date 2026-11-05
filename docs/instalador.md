# Instalador

Especificação do instalador do vibecoding-devtools. As cinco etapas estão implementadas e testadas em Linux e Windows.

| Etapa | Estado |
|---|---|
| 1. Detecção de Node, git, gitleaks, CLIs, PATH e stack (`node instalador/cli.mjs detectar`) | pronta |
| 2. Painel e flags (`instalar`, `--dry-run`, `--yes`) | pronta |
| 3. Instalação do kit, com as conversões | pronta |
| 4. ECC e Impeccable | pronta |
| 5. Estado e `desinstalar` | pronta |

Um comando prepara o ambiente de desenvolvimento com IA de ponta a ponta: confere o que existe na máquina, abre um
painel para escolher o que instalar e instala o kit, o ECC e o Impeccable nas CLIs escolhidas. O kit é distribuído só
pelo instalador, nunca como plugin (veja `docs/compatibilidade-clis.md`, seção Plugins).

## Decisões

- **Linguagem:** Node ≥ 22, no instalador e nos hooks. ECC e Impeccable já se instalam por `npx`, então o Node é
  pré-requisito de qualquer forma, e no Windows o `python3` pode ser só o atalho da Microsoft Store.
- **Painel:** `@clack/prompts`. As dependências ficam fixadas em `npm-shrinkwrap.json`, que o `npx` respeita.
- **CLIs suportadas:** Claude Code, Codex e Antigravity. O Claude Code é a fonte; as outras recebem conversões.
- **Escopo:** global por padrão (vale em todo projeto); o usuário pode escolher por projeto no painel.
- **Terceiros:** ECC e Impeccable vêm da fonte oficial, na versão fixada em `instalador/terceiros.json`. O kit não
  guarda cópia do código deles.
- **Rules do ECC:** quem copia é o nosso instalador, nas três CLIs, a partir do ECC na versão fixada. O instalador do
  ECC instala o resto (agentes, comandos, skills e, se pedido, hooks), sem o módulo de rules.
- **Telemetria do Impeccable:** desligada por padrão (`DO_NOT_TRACK=1` e `npx impeccable@4.8.0 telemetry off`).
- **Hooks de terceiros:** os do ECC e os do Impeccable vêm desligados por padrão; o painel pergunta.
- **Maestri:** só por escolha no painel ou pela flag `--maestri`.
- **Manutenção:** `uninstall` na 0.1.0; `update` depois. Os dois usam o estado gravado na instalação.

## Entrada

`npx github:Or4cu1o/vibecoding-devtools#v<versão>`: o npm baixa o repositório na tag e roda o instalador, sem publicar
pacote. A tag fixa a versão, como a superfície `segredos-e-infra` da skill `revisao-de-seguranca` exige para downloads.
Nada de `curl | bash`: o instalador só **exibe** o comando oficial de instalação de uma CLI ausente, nunca o executa.

```bash
npx github:Or4cu1o/vibecoding-devtools#v0.1.0             # painel
npx github:Or4cu1o/vibecoding-devtools#v0.1.0 uninstall   # remove só o que o kit instalou
```

## Fluxo

1. **Pré-requisitos:** Node ≥ 22 e git; faltando, explica como instalar e para. gitleaks é recomendado (as rules pedem
   a varredura antes do commit): faltando, avisa e segue.
2. **CLIs:** procura `claude`, `codex` e `agy`; mostra versão e pasta. Instalado mas fora do `PATH`: avisa qual pasta
   adicionar. Instalado mas sem responder a `--version`: aponta erro. Ausente: oferece o comando oficial de instalação
   (tabela em `docs/compatibilidade-clis.md`).
3. **Projeto:** quando roda dentro de um repositório, detecta a stack pelos arquivos (`package.json`, `tsconfig.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `composer.json`, `Gemfile`...) para sugerir as rules do ECC.
4. **Painel:**
   - CLIs alvo (as detectadas vêm marcadas).
   - Escopo: global ou projeto.
   - Kit: rules, skills e hooks, cada hook ligável à parte.
   - ECC: em quais CLIs; hooks do ECC (desligados por padrão); pacotes de rules da stack no projeto.
   - Impeccable: em quais CLIs.
   - Maestri: instalar as rules `maestri-protocolo` e `maestri-consumo` e as skills `maestri-protocol`,
     `maestri-agent-cli` e `maestri-budget`?
5. **Resumo:** lista cada arquivo e comando que vai rodar (dry-run) e pede confirmação.
6. **Instalação:** terceiros primeiro, depois o kit. Para em qualquer erro, sem deixar instalação pela metade sem aviso.
7. **Estado:** grava o que instalou e onde (`~/.vibecoding-devtools/estado.json`), para desinstalar e atualizar só o que
   é do kit.
8. **Relatório:** o que foi instalado em cada CLI e o que ficou para o usuário fazer (por exemplo, aprovar hooks no
   `/hooks` do Codex).

Modo sem painel: as mesmas escolhas por flags e `--yes`, para reinstalar ou rodar em CI (`--help` lista as flags).
Códigos de saída: `0` sucesso; `1` quando algo foi pulado, bloqueado ou falhou; `2` erro de uso.

## Arquitetura

O instalador monta um **plano** (lista de ações) a partir das escolhas e da detecção, mostra o plano e só então o
executa. Montar o plano não grava nada, o que dá o dry-run, os testes e a desinstalação. Um dono por arquivo:

| Arquivo | Responsabilidade |
|---|---|
| `detectar.mjs` | Etapa 1: Node, git, gitleaks, CLIs, PATH e stack (pronto). |
| `conversao.mjs` | Funções puras: rule do Claude Code para Antigravity (`trigger:`), rules para o bloco do Codex, pacote do ECC achatado com referências reescritas. |
| `plano.mjs` | `montarPlano(escolhas, deteccao, caminhos)`: devolve as ações, sem gravar nada. |
| `terceiros.mjs` e `terceiros.json` | Versões fixadas e comandos do ECC e do Impeccable (instalar e desinstalar); obter o ECC na tag para copiar as rules. |
| `estado.mjs` | Ler e gravar `~/.vibecoding-devtools/estado.json`. |
| `executar.mjs` | Aplicar o plano (ou só listar, no dry-run), registrar no estado e desinstalar pelo estado. |
| `painel.mjs` | Painel com `@clack/prompts` e, sem painel, as mesmas escolhas por flags. |
| `cli.mjs` | Comandos `detectar`, `instalar` (padrão) e `desinstalar`; flags `--dry-run`, `--yes`, `--json`. |

**Ações do plano**, cada uma com `dono` (`kit`, `ecc` ou `impeccable`) e `cli`:

- `copiar`: `origem` para `destino` (arquivo ou pasta).
- `escrever`: `conteudo` em `destino`.
- `bloco`: `conteudo` entre marcadores `<!-- vibecoding-devtools:inicio -->` e `<!-- vibecoding-devtools:fim -->` em
  `destino`, sem tocar o resto do arquivo.
- `comando`: `cmd` com `args` (lista, nunca uma string para o shell), em `cwd`, com `env` extra.

**O que já está instalado** (lido na detecção, antes do plano):

- Kit: versão e itens do `estado.json`, se existir.
- Skills com o mesmo nome nas pastas de cada CLI, instaladas por outra fonte.
- Plugins de cada CLI (`claude plugin list`, `codex plugin list`, `agy plugin list --json`), para achar o ECC ou o
  Impeccable instalado por plugin.
- ECC e Impeccable instalados por `npx`: o estado de instalação de cada um e a versão.

Com isso, o plano marca cada ação como **nova**, **igual** (pula), **atualizar** (item do kit ou de terceiro em outra
versão) ou **conflito** (existe e não é do kit: pula e avisa). Falha ou demora ao ler os plugins de uma CLI nunca
autoriza instalar: o terceiro fica bloqueado com aviso. Um terceiro já instalado por outro método (plugin em vez
de `npx`) não é instalado de novo: o relatório diz qual método está ativo.

**Regras de execução:**

- Nunca sobrescreve arquivo que não foi o kit que criou: registra conflito no relatório e pula, salvo `--force`.
- Registra no estado cada arquivo criado com o hash do conteúdo, cada bloco e cada comando de terceiros.
- Desinstalar remove só o que está no estado e não foi alterado depois (hash igual); remove os blocos; roda o
  `uninstall` do ECC; lista o que o Impeccable criou para o usuário confirmar. Arquivo alterado: avisa e mantém.
- Toda a casa do usuário vem de `caminhos.home` (e as pastas de cada CLI derivam dela), para os testes rodarem numa
  pasta temporária.

**Escolhas** (o que o painel ou as flags devolvem): CLIs alvo; escopo (`global` ou `projeto`, com a raiz); pacote
Maestri sim ou não; ECC (CLIs, hooks sim ou não, pacotes da stack); Impeccable (CLIs).

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
- **Rules com `paths:`** (do kit ou do ECC): no Antigravity viram `trigger: glob` com `globs:`; no Codex, linha da
  tabela de roteamento no bloco do kit.
- **Rules do ECC no Claude Code:** copie a pasta inteira de cada pacote, para manter as referências `../common/`.
- **Rules no Antigravity:** só o primeiro nível de `rules/` é lido. Achate os pacotes (`ecc-<pacote>-<arquivo>.md`) e
  reescreva as referências `../common/<x>.md` para o nome achatado; teste colisão de nomes e carregamento.

## ECC

- Versão fixada: `ecc-universal@2.2.3` (tag `v2.2.3` em `github.com/affaan-m/ECC`).
- **Módulos, sem perfil:** os perfis `minimal` e `core` incluem `rules-core`, que instalaria as rules de novo. O
  instalador passa os módulos explicitamente: `agents-core`, `commands-core`, `platform-configs` e `workflow-quality`, e
  `hooks-runtime` só se o usuário ligar os hooks do ECC (o que equivale ao `core` sem rules).
- Claude Code: `npx ecc-universal@2.2.3 install --target claude --modules <módulos>`, que registra o que instalou e
  permite desinstalar.
- Codex: plugin nativo (`codex plugin marketplace add affaan-m/ECC@v2.2.3` e `codex plugin add ecc@ecc`); os hooks pedem
  aprovação no `/hooks`.
- Antigravity: `npx ecc-universal@2.2.3 install --target antigravity --modules <módulos>`. É adaptador experimental, sem
  hooks, e grava no `.agents/` do projeto.
- **Nunca dois métodos para a mesma CLI** (plugin e `install`, por exemplo): os hooks duplicam.
- Precedência: as rules do kit dizem quais regras do ECC substituem (por exemplo, `testes` substitui a meta de 80% e o
  TDD obrigatório). As rules do projeto vencem as duas.

## Impeccable

- Versão fixada: `impeccable@4.8.0` no npm (tag `cli-v4.8.0` em `github.com/pbakaus/impeccable`), em todos os comandos.
- `npx impeccable@4.8.0 install --providers=<claude,codex,antigravity> --scope=<project|global> -y`. Sem TTY, passe
  sempre `-y` e `--providers`, senão o comando espera resposta.
- No escopo projeto, roda na raiz do projeto; no global, a casa do usuário serve de pasta de trabalho (verificado com a
  4.8.0, fora de um repositório git). Não tem desinstalação: o relatório avisa o que ele criou.
- No Antigravity entra só a skill, sem hook. Grava em `.agent/`, enquanto o ECC usa `.agents/`: confira se a skill não
  carrega duas vezes.

## Conferir na implementação

- Sintaxe de `--modules` com vários módulos e se `agents-core` escreve algum `AGENTS.md` (rodar com `--dry-run`).
- Se o plugin do ECC no Codex traz rules por conta própria.
