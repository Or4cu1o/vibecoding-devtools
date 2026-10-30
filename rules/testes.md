# Testes

**Problema que resolve:** suítes enormes que travam estrutura em vez de proteger comportamento (milhares de testes e várias
linhas de teste por linha de produção numa única release). **Custo que evita:** minutos de CI por PR e tokens
gastos escrevendo, mantendo e relendo testes de pouco valor. **Revisão desta regra:** a cada seis meses.

Teste protege comportamento, não trava estrutura. Esta regra substitui metas genéricas de cobertura e TDD obrigatório
(por exemplo, os 80% e o TDD do ECC). As regras de teste do repositório vencem esta.

## O que merece teste

- Segurança: autenticação, sessão, permissões, segredos e toda entrada de usuário.
- Dinheiro e dados pessoais.
- Persistência e migração de dados.
- Carregamento de configuração (precedência e tipos).
- Contratos com serviços externos (APIs, gateways, filas).
- Regras puras: funções sem efeito colateral que tomam uma decisão.
- Regressão de bug real: um teste por bug.

## Proibido

- Caracterização em massa (testes que fotografam todo o comportamento atual).
- Snapshots ou "dourados" de estrutura.
- Testes que leem o texto de docs, compose, Dockerfile ou workflows.
- Testes que dependem do relógio real ou de `sleep`.
- Testes tautológicos, que só reafirmam uma constante ou um mock.
- Vários testes para o mesmo caminho mudando só o valor: use uma parametrização enxuta.
- Teste de mutação fora do nível Alto.

## TDD

RED antes só para correção de bug e para regra pura. No resto, teste depois, e só se o item cair em "O que merece teste".

## Cobertura

- Piso global no repositório, que nunca cai.
- Piso maior (por exemplo, 90%) só nas áreas críticas que o projeto lista (dinheiro, autenticação, dados, regras puras),
  cobrado por um passo do CI: um PR que derruba a cobertura dessas áreas reprova.
- Nível Alto com dinheiro, dados pessoais ou autenticação: ≥ 80% no código alterado.
- Sem meta global só para subir o número.

## Marcadores

`smoke` (o sistema sobe), `critical` (áreas críticas) e `regression` (um por bug real). O CI roda `smoke` e `critical`
primeiro e falha cedo.

## Onde rodar

- O CI roda lint, typecheck e a suíte completa. Localmente, rode só os testes do que você mexeu.
- Vários agentes não rodam a mesma suíte no mesmo commit: o CI é a fonte da verdade.
- Pronto = CI verde.

## Sinal de alerta

Num item Baixo ou Médio, linhas de teste várias vezes maiores que as de produção indicam excesso. Pare e reavalie o que
realmente precisa de teste.
