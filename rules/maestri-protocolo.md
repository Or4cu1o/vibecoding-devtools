# Protocolo Maestri

Vale só quando você troca mensagens com outro agente pelo Maestri: `maestri ask` (com ou sem `--batch`) ou uma mensagem
recebida que começa com `~ `. Não vale para `maestri ask --raw`, que envia teclas, não mensagens.

- Antes de enviar ou responder, carregue a skill `maestri-protocol` e siga-a. Se ela não estiver disponível, avise o usuário
  em vez de seguir sem ela.
- Toda resposta a um agente começa com `~ <Seu nome> | <STATUS> | <ref> | <resumo de uma linha>`. Seu nome é o que aparece
  em `You:` no `maestri list`.
