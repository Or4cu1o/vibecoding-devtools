# Instalador

Especificação do instalador do vibecoding-devtools. Ainda não implementado.

Um comando prepara o ambiente de desenvolvimento com IA de ponta a ponta: confere o que existe na máquina, abre um painel
para escolher o que instalar e instala o kit, o ECC e o Impeccable nas CLIs escolhidas. O kit é distribuído só pelo
instalador, nunca como plugin (veja `docs/compatibilidade-clis.md`, seção Plugins).

## Decisões

- **Linguagem:** Node, no instalador e nos hooks. ECC e Impeccable já se instalam por `npx`, então o Node é pré-requisito de
  qualquer forma, e no Windows o `python3` pode ser só o atalho da Microsoft Store. O ECC exige Node ≥ 18.
- **CLIs suportadas:** Claude Code, Codex e Antigravity. O Claude Code é a fonte; as outras recebem conversões.
- **Escopo:** global por padrão (vale em todo projeto); o usuário pode escolher por projeto no painel.
- **Terceiros:** ECC e Impeccable vêm da fonte oficial, na versão fixada em `instalador/terceiros.json`. O kit não guarda
  cópia do código deles.
- **Telemetria do Impeccable:** desligada por padrão (`DO_NOT_TRACK=1` e `npx impeccable telemetry off`).
- **Maestri:** só por escolha no painel ou pela flag `--maestri`.

## Entrada

`npx github:Or4cu1o/vibecoding-devtools#v<versão>`: o npm baixa o repositório na tag e roda o instalador, sem publicar
pacote. A tag fixa a versão, como a regra de segredos e infraestrutura exige para downloads. Nada de `curl | bash`.

## Fluxo

1. **Pré-requisitos:** Node ≥ 18 e git. Faltando, explica como instalar e para.
2. **CLIs:** procura `claude`, `codex` e `agy`; mostra versão e pasta. Instalado mas fora do `PATH`: avisa e oferece o
   comando para corrigir. Ausente: oferece o comando oficial de instalação (tabela em `docs/compatibilidade-clis.md`).
3. **Projeto:** quando roda dentro de um repositório, detecta a stack pelos arquivos (`package.json`, `tsconfig.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `composer.json`, `Gemfile`...) para sugerir as rules do ECC.
4. **Painel:**
   - CLIs alvo (as detectadas vêm marcadas).
   - Escopo: global ou projeto.
   - Kit: rules, skills e hooks, cada hook ligável à parte.
   - ECC: em quais CLIs; perfil; hooks sim ou não; rules `common` e `web` globais nas CLIs escolhidas; rules da stack no
     projeto.
   - Impeccable: em quais CLIs.
   - Maestri: instalar `maestri-protocolo`, `maestri-protocol` e `maestri-agent-cli`?
5. **Resumo:** lista cada arquivo e comando que vai rodar (dry-run) e pede confirmação.
6. **Instalação:** terceiros primeiro, depois o kit. Para em qualquer erro, sem deixar instalação pela metade sem aviso.
7. **Estado:** grava o que instalou e onde (`~/.vibecoding-devtools/estado.json`), para atualizar e desinstalar só o que é
   do kit.
8. **Relatório:** o que foi instalado em cada CLI e o que ficou para o usuário fazer (por exemplo, aprovar hooks no
   `/hooks` do Codex).

Modo sem painel: as mesmas escolhas por flags e `--yes`, para reinstalar ou rodar em CI.

## O que vai em cada CLI

| Item | Claude Code | Codex | Antigravity |
|---|---|---|---|
| Rules do kit | `~/.claude/rules/vibecoding/` | bloco marcado em `~/.codex/AGENTS.md` | `~/.gemini/config/rules/`, com `trigger:` |
| Skills do kit | `~/.claude/skills/` | `~/.agents/skills/` | `~/.gemini/config/skills/` |
| Hooks do kit | `~/.claude/settings.json` | `~/.codex/hooks.json` (usuário aprova no `/hooks`) | `~/.gemini/config/hooks.json` |
| Modelo de projeto | `CLAUDE.md` com `@AGENTS.md` | `AGENTS.md` | `AGENTS.md` |

No escopo de projeto, as mesmas peças vão para `.claude/`, `.codex/`, `.agents/` e `AGENTS.md` do repositório.

## ECC

- Versão fixada: `ecc-universal@2.2.3` (tag `v2.2.3` em `github.com/affaan-m/ECC`).
- Claude Code: `npx ecc-universal@2.2.3 install --profile <perfil> --target claude ...`.
- Codex: plugin nativo (`codex plugin marketplace add affaan-m/ECC` e `codex plugin add ecc@ecc`); os hooks pedem
  aprovação no `/hooks`.
- Antigravity: `npx ecc-universal@2.2.3 install --profile minimal --target antigravity`. É adaptador experimental, sem
  hooks, e grava no `.agents/` do projeto.
- Rules: pacotes em `rules/` (`common`, `web` e um por stack: `typescript`, `python`, `golang`, `rust`, `java`, `react`,
  `vue`...). Copie a pasta inteira, não os arquivos, para manter as referências `../common/`. Claude Code global:
  `~/.claude/rules/ecc/<pacote>/`; projeto: `.claude/rules/ecc/<pacote>/`.
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

## Em aberto

- **ECC no Codex, escopo global:** `common` + `web` somam cerca de 34 KiB, acima dos 32 KiB que o Codex lê somando todos
  os `AGENTS.md`. Opções: subir `project_doc_max_bytes` no `config.toml`, colocar só `common` ou listar as rules como
  leitura sob demanda.
- **ECC no Antigravity, escopo global:** o instalador do ECC só grava no projeto; para global, o nosso instalador copiaria
  as rules para `~/.gemini/config/rules/` com `trigger:`.
- Perfil padrão do ECC (`minimal`, `core` ou `full`) e se os hooks dele vêm ligados.
- Biblioteca do painel (por exemplo, `@clack/prompts`).
- Comandos de atualizar e desinstalar.
