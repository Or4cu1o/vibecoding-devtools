# Processo por risco

O esforço, o tempo e o custo em tokens acompanham o risco da mudança. Trocar uma imagem leva minutos; um sistema de
pagamento recebe revisão completa.

## Como classificar

- Quem pede o trabalho (o orquestrador, ou o próprio agente quando trabalha sozinho) diz o nível no início.
- O arquivo mais arriscado da mudança decide o nível dela inteira.
- Quem encontrar mais risco no caminho avisa, e o nível sobe. O nível não desce no meio do trabalho sem acordo.
- Cada projeto pode ter um mapa de risco próprio no `AGENTS.md` (o que é Alto ali). O mapa do projeto vence esta regra.

## Níveis

### Baixo

Imagens e assets, textos, emojis, estilo, documentação, valores de configuração, versão, texto de log, remoção de código
morto.

- Sem contrato, sem teste novo (a menos que as regras de teste do repositório exijam) e sem revisores.
- Pronto = CI verde + revisão automática sem achado Crítico ou Maior + varredura de segredos limpa.

### Médio

Correção de bug e mudança de comportamento existente que não toca superfície Alta.

- O pedido é o contrato: objetivo, arquivos e critério de pronto, em poucas linhas.
- Bug: um teste de regressão, escrito antes (RED). Regra pura: testes antes. O resto: teste só onde as regras de teste pedem.
- Uma revisão: quem orquestra lê o diff. Arquitetura só se a mudança cruza módulos; segurança só se encosta numa superfície Alta.
- Pronto = Baixo + essa revisão.

### Alto

Dinheiro e valores (pagamentos, saldos, vendas, integrações financeiras); dados pessoais ou sensíveis; autenticação,
sessão, permissões e ações administrativas; segredos e tokens; entrada externa que o sistema executa ou publica para outros
(injeção, menções em massa, links maliciosos); migração ou exclusão de dados; deploy, CI e cadeia de suprimentos.

- Contrato de no máximo uma página: comportamento, interfaces, decisões do dono e plano de teste focado no risco.
- Modelo de ameaça só da superfície sensível, antes do código.
- Testes nos caminhos de risco.
- Arquitetura, testes e segurança revisam uma vez cada, em paralelo, no commit final.
- Dinheiro, dados pessoais ou autenticação feita do zero: baseline completo (OWASP ASVS 5.0 L2), e2e de cada fluxo de
  autenticação e de pagamento, cobertura ≥ 80% no código alterado e todo achado Médio ou acima corrigido antes do merge.

## Em todos os níveis

- **Paralelo por área:** um item que envolve front, back e infra vai ao construtor de cada área ao mesmo tempo, com um dono
  por arquivo. Eles combinam a interface compartilhada diretamente, e quem orquestra confere uma vez que as partes se
  encaixam. Dois trabalhando custam quase o mesmo que um fazendo tudo, e terminam antes.
- **Uma passada por revisão**, no commit final. Revisa de novo só quem teve código de produção da sua área alterado; commit
  só de teste ou de docs não chama ninguém.
- **Revisão automática** (CodeRabbit, GitGuardian e afins): espere a revisão terminar e corrija tudo num envio só. Segredo,
  Crítico e Maior bloqueiam; Menor e nitpick: corrija se for trivial, senão responda o motivo e resolva.
- **Achados:** Crítico e Alto bloqueiam; Médio bloqueia no nível Alto ou quando o próprio PR introduziu a regressão; Baixo e
  problemas que já existiam antes do PR vão para o backlog e nunca abrem um ciclo novo no mesmo PR.
- **Laço:** a mesma correção falhando duas vezes volta para quem orquestra, sem terceira tentativa.
- **Comunicação:** mensagem só para quem precisa agir, relatório curto com evidência. Ao dono, só decisões, merges,
  releases e bloqueios.
- **CHANGELOG:** quem constrói escreve a linha no próprio PR.
