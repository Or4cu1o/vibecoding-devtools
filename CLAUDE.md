# vibecoding-devtools

Kit de rules, skills, hooks e modelos para desenvolvimento com IA em Claude Code, Codex e Antigravity. Este arquivo vale
para quem trabalha no próprio kit; o modelo para os projetos está em `templates/AGENTS.md`.

## Convenções

- **Genérico:** nada de nomes de projetos, pessoas ou empresas. As únicas dependências citadas são ECC e Impeccable.
- **Fonte:** o formato do Claude Code é a fonte; as conversões para Codex e Antigravity seguem
  `docs/compatibilidade-clis.md`. Mudou algo nesse carregamento, atualize esse arquivo.
- **Idioma:** pt-BR. As skills do pacote Maestri estão em inglês até decidirmos a tradução.
- **Markdown:** linhas de até 120 caracteres, tabelas compactas (`|---|`) e bloco de código sempre com a linguagem.
- **Rules:** um tema por arquivo em `rules/`, curto e sempre válido; checklist longo vira skill.
- **Skills:** `skills/<nome>/SKILL.md`, com `name` igual ao nome da pasta e `description` numa linha só. Outros campos só
  valem no Claude Code.
- **Referências:** ao citar uma regra ou skill (regra `testes`, skill `triagem-de-risco`), ela precisa existir no kit.
- **Achados e risco:** a escala e a regra de bloqueio ficam só na `processo-por-risco`; os outros arquivos apontam para ela.

## Versões

SemVer com tag `vX.Y.Z`. Toda mudança entra em `[Unreleased]` no `CHANGELOG.md`, no mesmo commit; no release, a seção
vira `[X.Y.Z] - AAAA-MM-DD`. Commits em Conventional Commits.

## Verificação

O mesmo que o CI roda, antes de todo commit:

```bash
npx markdownlint-cli2 "**/*.md"
node scripts/validar-kit.mjs
gitleaks git --no-banner
```
