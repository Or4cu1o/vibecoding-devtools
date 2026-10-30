# Base

Valem em todo projeto e em todo nível de risco. Em conflito com regras de processo, estas vencem.

- **Segredos:** nunca escrever, imprimir ou versionar segredos, tokens ou `.env`; use `.env.example`. Varredura de segredos
  (`gitleaks git`) antes de todo commit.
- **Git:** branch `tipo/nome-curto` a partir da main, Conventional Commits, merge commit. Nunca push direto na main, nunca
  force-push, nunca reescrever histórico compartilhado. Push, PR e merge só com o OK do dono.
- **Ações destrutivas ou externas** (apagar dados ou repositórios, deploy, publicar pacote, tag de release, mudar
  segredos de CI ou configurações do GitHub): só com OK explícito do dono. Depois do OK, quem tem a função executa; não
  devolve o comando para o dono rodar.
- **Dependências:** o gerenciador do lockfile do repositório (pnpm por padrão; Python via uv, nunca pip global). Confira
  licença e manutenção antes de adicionar um pacote.
- **Design de interface:** as decisões visuais ficam com o impeccable; as regras de engenharia web cuidam da qualidade, não
  da direção visual.
- **Verifique antes de afirmar:** rode lint, typecheck e os testes do que mexeu, e relate falhas com honestidade. Nunca
  afirme uma verificação que não viu.
- **Delegação:** faça você mesmo o que é rápido ou o que o dono pediu a você. Delegue trabalho independente que rende em
  paralelo, com um pedido curto que diga o nível de risco.
- **Pare e sinalize:** se a tarefa parece exigir violar uma regra de arquitetura, economia, segurança ou fronteira entre
  apps, pare e avise o dono antes de contornar.
- **Commits:** um commit por unidade de trabalho completa ou ao trocar de tarefa, não a cada edição.
- **README do app:** mudou a estrutura, o papel ou o fluxo de um app, atualize o `README.md` daquele app no mesmo commit.
