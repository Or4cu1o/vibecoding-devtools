# Processo por risco

O esforço, o tempo e o custo em tokens acompanham o risco da mudança. Trocar uma imagem leva minutos; um sistema de
pagamento recebe revisão completa.

## Como classificar

- Quem pede o trabalho (o orquestrador, ou o próprio agente quando trabalha sozinho) diz o nível no início.
- O arquivo mais arriscado da mudança decide o nível dela inteira.
- Quem encontrar mais risco no caminho avisa, e o nível sobe. O nível não desce no meio do trabalho sem acordo.
- Triagem feita por modelo leve só mantém ou sobe o nível, nunca o rebaixa.
- Cada projeto pode ter um mapa de risco próprio no `AGENTS.md` (o que é Alto ali). O mapa do projeto vence esta regra.

## Níveis

### Baixo

Imagens e assets, textos, emojis, estilo, documentação, versão, texto de log, remoção de código morto fora de superfície
Alta, e valores de configuração que não tocam autenticação, permissões, CORS, limites, segredos ou dinheiro.

- Sem contrato, sem teste novo (a menos que as regras de teste do repositório exijam) e sem revisores.
- Pronto = CI verde + nenhum achado que bloqueie (veja **Achados**) + varredura de segredos limpa.

### Médio

Correção de bug e mudança de comportamento existente que não toca superfície Alta.

- O pedido é o contrato: objetivo, arquivos e critério de pronto, em poucas linhas.
- Testes conforme a regra `testes`.
- Uma revisão: quem orquestra lê o diff. Arquitetura só se a mudança cruza módulos; segurança só se encosta numa
  superfície Alta.
- Pronto = Baixo + essa revisão.

### Alto

Dinheiro e valores (pagamentos, saldos, vendas, integrações financeiras); dados pessoais ou sensíveis; autenticação,
sessão, permissões e ações administrativas; segredos e tokens; entrada externa que o sistema executa ou publica para
outros (injeção, menções em massa, links maliciosos); migração ou exclusão de dados; deploy, CI e cadeia de suprimentos.

- Contrato de no máximo uma página: comportamento, interfaces, decisões do dono e plano de teste focado no risco.
- Modelo de ameaça só da superfície sensível, antes do código.
- Testes nos caminhos de risco.
- Arquitetura, testes e segurança revisam uma vez cada, em paralelo, no commit final.
- Dinheiro, dados pessoais ou autenticação: e2e de cada fluxo tocado e cobertura ≥ 80% no código alterado. Fluxo desses
  criado do zero: também o baseline completo (OWASP ASVS 5.0 L2).

## Em todos os níveis

- **Paralelo por área:** quando um item envolve áreas independentes (front, back, infra), cada uma vai ao seu construtor
  ao mesmo tempo, com um dono por arquivo. Eles combinam a interface compartilhada diretamente, e quem orquestra confere
  uma vez que as partes se encaixam. Mudança pequena fica com um só.
- **Uma passada por revisão**, no commit final. Revisa de novo só quem teve código de produção da sua área alterado;
  commit só de teste ou de docs não chama ninguém.
- **Revisão automática** (CodeRabbit, GitGuardian e afins): espere a revisão terminar e corrija tudo num envio só.
- **Sem CI, revisão automática ou revisores:** rode localmente o equivalente (lint, typecheck, testes do que mexeu,
  varredura de segredos), faça as revisões em sequência e diga no relatório o que não pôde ser verificado.
- **Achados:** toda revisão (de pessoa, de agente ou automática) classifica cada achado em **Crítico**, **Maior**,
  **Menor** ou **Sugestão** (o nitpick da revisão automática). Baixo, Médio e Alto são só níveis de risco da tarefa,
  nunca de achado. Esta é a única fonte da regra de bloqueio; skills e outras regras apontam para cá.
  - **Segredo exposto:** bloqueia sempre, mesmo se anterior ao PR. Rotacione o segredo antes de seguir.
  - **Crítico** e **Maior** do PR: bloqueiam sempre.
  - **Menor:** bloqueia em tarefa de nível Alto. Nos outros níveis, corrija se for trivial; senão, responda o motivo e
    mande para o backlog.
  - **Sugestão:** corrija se for trivial; senão, backlog.
  - **Anterior ao PR:** Menor e Sugestão vão para o backlog e não abrem ciclo novo. Crítico e Maior bloqueiam até o dono
    decidir entre corrigir no PR ou aceitar o risco, registrado em canal privado, nunca em issue pública.
- **Laço:** a mesma correção falhando duas vezes volta para quem orquestra, sem terceira tentativa.
- **Comunicação:** mensagem só para quem precisa agir, relatório curto com evidência. Ao dono, só decisões, merges,
  releases e bloqueios.
- **CHANGELOG:** quem constrói escreve a linha no próprio PR.
