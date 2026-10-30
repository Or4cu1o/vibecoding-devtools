# Contas e dados pessoais

## Autenticação

- Bibliotecas consagradas, nunca criptografia própria. Senha com argon2id (bcrypt com custo ≥ 12 como alternativa).
- Login social: OAuth2 com código + PKCE, troca do código no servidor, `state` verificado.
- Limite de tentativas e bloqueio progressivo no login, no reset e na verificação de código.
- Mensagens genéricas: não revelar se o e-mail ou o usuário existe.
- Reset de senha com token de uso único, validade curta e guardado só como hash.
- MFA obrigatório para admin. Confirmação extra (step-up) antes de saque, troca de valor alto e mudança de e-mail ou de
  senha.
- Trocar a senha encerra as outras sessões.

## Sessão

- Cookie `httpOnly`, `Secure` e `SameSite`; nada de token de sessão em `localStorage`.
- Proteção contra CSRF em toda ação que muda estado.
- A sessão é renovada no login, expira por inatividade e é encerrada no servidor no logout.

## Autorização

- Checagem por objeto em toda rota: o usuário A nunca lê nem altera um recurso de B (BOLA/IDOR).
- Papéis decididos no servidor, com negação por padrão. Admin separado, com toda ação registrada.
- Allowlist de campos na entrada: o cliente nunca define `role`, `saldo`, `dono` nem `status` (mass assignment).
- Paginação com teto; nenhuma listagem expõe dados de outros usuários.

## Dados pessoais (LGPD)

- Coletar o mínimo, com finalidade e base legal definidas.
- Prazo de retenção para cada dado, com apagamento ou anonimização ao fim.
- Criptografia em trânsito sempre; em repouso para documentos, CPF, endereço e dados financeiros.
- Logs sem dados pessoais (mascare e-mail, CPF e telefone) e sem segredos.
- O titular consegue exportar e excluir os próprios dados.
- Todo acesso de admin a dados pessoais fica registrado.

## Testes obrigatórios

- Matriz de autorização: cada papel contra cada recurso, incluindo A tentando acessar B.
- Fluxos de ponta a ponta: cadastro, login, logout, reset, senha errada, bloqueio e sessão expirada.
- Campo proibido enviado pelo cliente (`role`, `saldo`): ignorado ou rejeitado.
- Token de reset reutilizado ou vencido: rejeitado.
