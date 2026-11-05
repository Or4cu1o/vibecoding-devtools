# Changelog

Mudanças relevantes do vibecoding-devtools. Formato baseado em [Keep a
Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-11-04

### Adicionado

- Instalador completo: painel com `@clack/prompts` e flags; plano de ações com situação nova, igual, atualizar ou
  conflito; conversões para Codex (bloco no `AGENTS.md` com orçamento de 32 KiB) e Antigravity (`trigger:` e pacotes
  do ECC achatados com links reescritos); ECC e Impeccable em versões fixadas; estado com trava, escrita atômica e
  desinstalação pelo hash. Testado de ponta a ponta em Linux e Windows.
- `maestri-agent-cli`: onde cada CLI lista os identificadores exatos de modelo e como passá-los no lançamento.

## [0.0.2] - 2026-11-04

### Adicionado

- CI no GitHub Actions: markdownlint, validação da estrutura do kit (`scripts/validar-kit.mjs`) e varredura de segredos
  com gitleaks. Actions fixadas por SHA e gitleaks com hash conferido.
- `CLAUDE.md` com as convenções e a verificação para quem trabalha no kit.
- Skill `maestri-budget` e regra `maestri-consumo`: o Maestro lê cota e contexto só em checkpoints, calcula o ritmo de
  cada cota para que dure o ciclo inteiro e acabe quase vazia e distribui o trabalho entre as CLIs; limpa o contexto
  antes de uma tarefa sem relação com a anterior e compacta só entre tarefas. Troca de modelo só em agentes
  Antigravity que o usuário marcar como gerenciados.
- Instalador, etapa 1: `node instalador/cli.mjs detectar` confere Node, git, Claude Code, Codex e Antigravity (versão,
  pasta e se estão fora do PATH) e sugere os pacotes de rules do ECC pela stack do projeto. Testes rodam no CI em Linux
  e Windows.

### Alterado

- Revisão dupla (Claude e Codex), com contraproposta até o consenso:
  - `processo-por-risco`: regra de bloqueio sem contradição (Menor bloqueia só em nível Alto; Crítico e Maior
    anteriores ao PR esperam a decisão do dono); cobertura e baseline com escopo único; caminho para projeto sem CI ou
    revisores; paralelo só entre áreas independentes; triagem por modelo leve nunca rebaixa o nível.
  - `base`: varredura de segredos sobre o que vai entrar no commit (`gitleaks git --pre-commit --staged --redact`) e
    consulta à documentação oficial de plataformas que mudam.
  - `contexto-sob-demanda` só carrega ao mexer em `AGENTS.md`, `CLAUDE.md`, rules ou skills (`paths:`).
  - `maestri-consumo` encurtada; `maestri-budget` com faixas de ritmo corretas (acima de 1,0 a cota acaba antes da
    renovação) e decisão pela janela mais restritiva; `maestri-protocol` reconhece o rodapé de delegação.
  - Instalador: detecção distingue CLI que não responde, lê PATH entre aspas, detecta gitleaks e explica por que o
    projeto não foi reconhecido; especificação com versões fixadas em todos os comandos e rules achatadas para o
    Antigravity.
  - Validador aceita CRLF e BOM, recusa `description` em bloco e confere referências em inglês; roda também no Windows.
    `.gitattributes` fixa LF.
- `maestri-agent-cli`: o Maestro registra a CLI e a conta de cada agente num `ledger.md` na própria pasta de sessão e
  consulta antes de agir; quando a tela não bate com a referência, confia na tela e avisa o usuário; a skill não
  carrega mais a cada `maestri check`. Referências com as três cotas do Antigravity (Gemini, Claude e GPT, Argon) e onde
  ler o contexto em cada CLI.
- Markdown dentro do limite de 120 colunas, com a linguagem em todo bloco de código.
- Especificação do instalador fechada: Node ≥ 22, painel em `@clack/prompts`, rules do ECC copiadas pelo próprio
  instalador (`common` global nas três CLIs e `web` só no Claude Code), ECC por módulos sem `rules-core`, hooks do ECC
  desligados por padrão e `uninstall` na 0.1.0.

## [0.0.1] - 2026-10-29

### Adicionado

- `README.md` com o conteúdo do kit.
- Rules: `base`, `processo-por-risco`, `testes`, `modelos-por-risco`, `contexto-sob-demanda` e `maestri-protocolo`.
- Skills: `triagem-de-risco`, `revisao-de-seguranca` (superfícies dinheiro e valores, contas e dados, entradas e
  serviços, segredos e infraestrutura), `maestri-protocol` e `maestri-agent-cli` (referências para Antigravity, Claude
  Code e Codex).
- Modelos em `templates/`: `.coderabbit.yaml`, `AGENTS.md` (roteamento e mapa de risco) e `CLAUDE.md` que importa o
  `AGENTS.md`.
- Ideias de hooks em `hooks/README.md`, incluindo a validação do cabeçalho do protocolo Maestri.
- `docs/compatibilidade-clis.md`: como Claude Code, Codex e Antigravity carregam instruções, rules, skills, hooks e
  agentes.
- `docs/instalador.md`: especificação do instalador.

### Alterado

- Licença de GPL-2.0 para MIT.
- Achados de revisão passam a usar Crítico, Maior, Menor e Sugestão; Baixo, Médio e Alto ficam só para o risco da
  tarefa. A regra de bloqueio fica só na `processo-por-risco`.
