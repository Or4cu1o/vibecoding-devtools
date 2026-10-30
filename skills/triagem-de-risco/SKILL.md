---
name: triagem-de-risco
description: Classifica uma tarefa ou um diff no nível de risco Baixo, Médio ou Alto e devolve o roteiro mínimo de contrato, testes e revisões. Use no início de toda tarefa de código, antes de delegar, e quando um achado sugerir que o risco mudou.
---

# Triagem de risco

Objetivo: gastar o mínimo de tempo e de tokens que o risco permite, sem deixar brecha onde há dinheiro, dados ou acesso.
Siga a regra `processo-por-risco` e a regra `testes`.

## Passos

1. Liste os arquivos que a mudança vai tocar. Se o diff já existe: `git diff --name-only <base>...HEAD`.
2. Leia o mapa de risco do projeto no `AGENTS.md`, se existir. Ele vence a lista genérica abaixo.
3. Marque o nível de cada arquivo:
   - **Alto:** dinheiro e valores (pagamentos, saldos, vendas), dados pessoais, autenticação, sessão, permissões,
     comandos administrativos, segredos, entrada externa que o sistema publica ou executa, migração ou exclusão de dados,
     deploy, CI, dependências.
   - **Médio:** lógica de negócio, correção de bug, mudança de comportamento.
   - **Baixo:** assets, textos, estilo, docs, configuração, versão, logs.
4. O nível da tarefa é o maior entre os arquivos.
5. Se houver mais de uma área (front, back, infra), divida: um construtor por área, em paralelo, um dono por arquivo.
   No nível Alto, chame a skill `revisao-de-seguranca` só com as superfícies tocadas.
6. Responda neste formato, em no máximo 8 linhas:

```text
Nível: <Baixo|Médio|Alto>: <motivo em uma frase, citando o arquivo que decidiu>
Áreas: <front/back/infra e quem faz cada uma>
Contrato: <nenhum | o próprio pedido | uma página>
Testes: <nenhum | 1 de regressão | caminhos de risco: ...>
Revisões: <CI + revisão automática | + leitura do diff | + arquitetura, testes e segurança em paralelo>
Pronto quando: <critério>
```

## Exemplos

- Trocar o ícone de um provedor: **Baixo**. Sem testes e sem revisores; CI verde.
- Corrigir um comando que trava ao pular de faixa: **Médio**. Um teste de regressão e leitura do diff.
- Correção que mexe no endpoint do painel e no componente da tela: **Médio**, em duas áreas: back e front em paralelo.
- Novo checkout com cartão: **Alto**, com baseline completo.
- Publicar num canal um texto vindo de fora (nome de música, nome de usuário): **Alto só nesse ponto**. Confira o escape
  de menções e de links; o resto da mudança segue o próprio nível.
