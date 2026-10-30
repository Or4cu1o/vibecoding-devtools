# Entradas e serviços expostos

## Toda entrada

- São entradas não confiáveis: o usuário, mas também o banco, arquivos locais, filas, webhooks e APIs de terceiros.
- Validação por esquema na borda: tipos, campos permitidos, tamanho máximo de strings e de listas, IDs no formato
  esperado.
- Consultas sempre parametrizadas ou pelo ORM; nada de montar SQL ou filtro com texto do usuário.
- Erro para o cliente é genérico: sem traceback, `repr` da exceção, caminho de arquivo nem configuração. O detalhe fica
  no log do servidor.

## Desserialização

- Proibido `pickle`, `marshal`, `shelve` e equivalentes para dados persistidos ou recebidos. Use JSON validado.
- YAML só com carregador seguro; XML com entidades externas desligadas.

## APIs HTTP e WebSocket

- Autenticação decidida pela configuração e pelo servidor, nunca por um campo que o cliente envia. Segredo comparado em
  tempo constante (`hmac.compare_digest` ou equivalente).
- CORS e `Origin` com allowlist; nunca aceitar qualquer origem.
- Limites de tamanho de mensagem, de conexões por cliente e de taxa por rota cara ou sensível.
- WebSocket: decodificar dentro de `try`, exigir objeto, `op` numa lista permitida; mensagem inválida é descartada sem
  derrubar o handler.
- Repassar a outros clientes só campos de uma allowlist, nunca o payload recebido inteiro.
- Cabeçalhos de segurança (CSP, HSTS, `X-Content-Type-Options`) e TLS em produção.

## Requisições para fora (SSRF)

- Nada de buscar uma URL fornecida pelo usuário sem allowlist de esquema e de domínio, e sem bloquear IPs internos.
- Toda requisição de saída com `timeout` explícito.

## Uploads

- Tamanho máximo, tipo conferido pelo conteúdo e não pela extensão, nome gerado pelo servidor, armazenamento fora da
  raiz pública.

## Mensagens que o sistema publica (bots, chats, e-mails)

- Texto vindo de usuário ou de terceiros, quando republicado, tem menções desligadas ou escapadas (no Discord,
  `AllowedMentions.none()`), para evitar `@everyone` e afins injetados.
- Links vindos de fora são exibidos como texto ou passam por allowlist; nada de link mascarado com destino controlado
  por terceiros.
- Limite de tamanho e de frequência no que o sistema publica em nome de alguém.

## Testes obrigatórios

- Payload fora do esquema (tipo errado, campo a mais, tamanho excessivo): rejeitado sem erro 500.
- Origem não permitida e mensagem acima do limite: recusadas.
- Texto com `@everyone` ou menção injetada: publicado sem notificar ninguém.
