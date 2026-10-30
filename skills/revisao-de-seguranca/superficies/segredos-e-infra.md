# Segredos e infraestrutura

## Segredos

- Nunca em código, log, mensagem, anexo, relatório de erro, mensagem de exceção ou resposta ao cliente. Para diagnóstico,
  registre só se o valor está presente ou ausente.
- URL de conexão em log tem a credencial mascarada (`postgres://***@host`).
- Toda variável sensível nova entra vazia e documentada no `.env.example`, e é lida num único carregador de configuração.
- Exportação de configuração troca segredos por placeholders.
- Exceção pública (por exemplo, um client ID que vai em toda URL de autorização) só por nome explícito e validação de formato;
  qualquer valor fora do formato continua sendo segredo.
- `.env`, bancos locais e caches fora do git e fora da imagem Docker (`.gitignore` e `.dockerignore`).

## Comandos de admin e subprocessos

- Argumentos como lista; `shell=True` só num comando de shell de admin que existe para isso.
- Ambiente mínimo nos subprocessos (allowlist como `PATH`, `HOME`, `LANG`); nunca repassar o ambiente inteiro.
- A saída de comandos de admin passa por mascaramento de segredos e vai só para o admin, nunca para um canal público.
- `eval` e consoles remotos desligados por padrão, ligados por configuração.
- Toda execução de comando de admin fica registrada (quem, o quê, quando), sem segredos.
- Autoatualização só do repositório oficial, por tag ou commit verificado, sem descartar alterações locais em silêncio.
- Reinício por encerramento ordenado e código de saída diferente de zero, deixando o supervisor subir de novo; nunca
  matar PIDs alheios.

## Downloads de binários e scripts

- URL com versão fixa (tag ou release imutável, nunca `main` ou `latest`) e SHA-256 fixo.
- Baixar para arquivo temporário, verificar o hash, mover de forma atômica; hash errado apaga o arquivo e aborta.
- Só HTTPS, com `timeout`. Proibido `curl | bash` ou executar script baixado na hora.

## Dependências

- Versão exata e hash no lock, instalação exigindo os hashes.
- Prefira releases do registro oficial; dependência por git só fixada por SHA completo de commit.
- Antes de adicionar: uso real, manutenção ativa, licença compatível e auditoria sem vulnerabilidade alta ou crítica.

## Docker, CI e scripts

- Imagem base fixada por digest, usuário sem root, nenhum segredo em camada ou em `ARG`.
- Scripts bash com `set -euo pipefail`, variáveis entre aspas e sem imprimir o ambiente.
- Nenhum segredo em YAML de compose ou de workflow; use secrets do CI ou `.env` local ignorado.
- GitHub Actions fixadas por SHA, `permissions:` mínimas e nada de `pull_request_target` executando código do PR.
- Opção nova de segurança nasce com o valor seguro como padrão.
