---
name: revisao-de-seguranca
description: Checklist de segurança por superfície para trabalho de nível Alto - dinheiro e valores (pagamentos, saldos, vendas, trocas), contas e dados pessoais, entradas e serviços expostos, segredos e infraestrutura. Use ao escrever o contrato, o modelo de ameaça ou a revisão de um item Alto; carregue só as superfícies que a mudança toca.
---

# Revisão de segurança

**Problema que resolve:** brechas onde há dinheiro, dados ou acesso. **Custo que evita:** revisar tudo em toda mudança;
esta skill só entra no nível Alto (regra `processo-por-risco`) e só com as superfícies tocadas.

## Passos

1. Liste as superfícies que a mudança toca (skill `triagem-de-risco`).
2. Leia **só** os arquivos dessas superfícies:

   | Superfície | Arquivo | Quando |
   |---|---|---|
   | Dinheiro e valores | `superficies/dinheiro.md` | pagamentos, meios de pagamento, plataformas financeiras, saldos, carteiras, vendas, assinaturas, trocas entre usuários, estornos |
   | Contas e dados pessoais | `superficies/contas-e-dados.md` | cadastro, login, sessão, papéis, admin, dados de usuário |
   | Entradas e serviços | `superficies/entradas-e-servicos.md` | APIs HTTP, WebSocket, webhooks recebidos, uploads, mensagens publicadas, dados de fora |
   | Segredos e infraestrutura | `superficies/segredos-e-infra.md` | tokens e chaves, comandos de admin, subprocessos, downloads, dependências, Docker, CI |

3. **Contrato:** copie os itens que se aplicam como critérios de pronto. **Modelo de ameaça:** só dessas superfícies.
4. **Revisão:** para cada item aplicável, Pass ou achado com severidade, `arquivo:linha`, cenário de abuso e correção.
5. **Triagem:** Crítico e Alto bloqueiam sempre; Médio bloqueia em dinheiro, contas e dados pessoais; Baixo vai ao backlog.
6. Falha ainda não corrigida nunca é descrita em issue, PR, commit ou documento público.

## Ferramentas

Varredura de segredos (`gitleaks git` e `gitleaks dir`), auditoria de dependências do gerenciador do projeto
(`pnpm audit`, `npm audit`, `uvx pip-audit`, `govulncheck`), e os testes de risco listados em cada superfície.
