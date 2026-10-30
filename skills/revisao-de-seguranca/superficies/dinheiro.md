# Dinheiro e valores

Vale para todo código que cria, calcula, guarda ou move valor: dinheiro, meios de pagamento, integrações com plataformas
de infraestrutura financeira, saldos, créditos, vendas, assinaturas, estornos e trocas entre usuários.

## Valores

- Dinheiro em inteiro na menor unidade (centavos) ou decimal exato, sempre com a moeda junto. Nunca `float`.
- Regra de arredondamento única, escrita no contrato, aplicada num só lugar.

## Pagamentos

- Preço, desconto, taxa e total são calculados no servidor. Nunca confie em valor, preço ou moeda vindos do cliente.
- Use o checkout ou a tokenização do provedor: nenhum dado de cartão passa pelo seu servidor nem é guardado.
- **Webhooks do provedor:** verifique a assinatura sobre o corpo bruto, com comparação em tempo constante; rejeite eventos
  fora da janela de tempo (replay); trate cada evento uma vez só, pelo id dele; responda 2xx só depois de gravar.
- O redirect do navegador não prova pagamento. O estado vem do webhook ou de uma consulta ao provedor.
- Chave de idempotência em toda criação de cobrança, captura e estorno.
- Estados explícitos (pendente, pago, falhou, estornado, contestado) e só as transições permitidas.
- Reconciliação periódica com o provedor; divergência gera alerta, não correção silenciosa.

## Saldos e carteiras

- Um único módulo movimenta saldo e grava a transação. Nenhum outro módulo, endpoint ou script altera saldo direto no
  banco.
- Todo valor que gera ou move saldo (preço, prêmio, crédito, cashback, item que vale moeda) é calculado e validado só no
  servidor; o cliente apenas exibe.
- Saldo não é um campo editável: é a soma de lançamentos de um livro-razão. Em partidas dobradas, todo crédito tem um débito
  correspondente.
- Lançamentos só por inserção. Correção é um lançamento de estorno, nunca `UPDATE` ou `DELETE`.
- Toda movimentação acontece numa transação do banco, com bloqueio da conta (`SELECT ... FOR UPDATE`) ou controle otimista
  de versão. A checagem de saldo suficiente fica dentro da mesma transação, para não haver gasto duplo em corrida.
- Restrições no próprio banco: saldo nunca negativo (`CHECK`) quando a regra exige; chave de idempotência única.
- Trilha de auditoria em cada lançamento: quem, quando, por quê e o id da requisição de origem.
- Limites por usuário e por período, e alerta para padrões anormais.
- Saldo que representa dinheiro resgatável pode cair em regulação (no Brasil, as regras do Banco Central para instituições
  de pagamento). Confirme com o jurídico antes de permitir saque ou transferência de dinheiro real.

## Trocas entre usuários

- Troca atômica: os dois lados mudam na mesma transação, ou nada muda.
- Consentimento das duas partes sobre o estado exato da oferta (versão ou hash). Qualquer mudança na oferta invalida o aceite.
- O que está ofertado fica reservado (custódia) enquanto a oferta está aberta, e volta no cancelamento ou na expiração.
- Posse conferida no servidor no momento da execução: só o dono oferece o que é seu.
- Estados terminais (concluída, cancelada, expirada); aceitar duas vezes não executa duas trocas.
- Limite de taxa e de valor; atenção a contas novas e a trocas desequilibradas repetidas (fraude e lavagem).
- Registro completo de cada troca para resolver disputas.

## Testes obrigatórios

- Duas requisições concorrentes gastando o mesmo saldo: só uma passa.
- A mesma requisição ou o mesmo webhook repetido: um único efeito.
- Webhook com assinatura inválida, corpo alterado ou fora da janela de tempo: rejeitado.
- Transição de estado proibida: rejeitada.
- Arredondamento nos limites (centavos, divisões, moedas diferentes).
- Oferta alterada depois do aceite da outra parte: troca não executa.
- Usuário A não movimenta saldo nem oferta itens de B.
