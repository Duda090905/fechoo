# Análise da branch `Sprint-2` (implementação do outro integrante)

> **Modo somente leitura.** Nada foi alterado na branch analisada e nenhum merge foi feito. Tudo foi executado numa **cópia isolada** extraída com `git archive`, com um **banco MySQL temporário** criado só para esta análise (apagado no fim). O banco real `fecho` e a `main` não foram tocados.

| Item | Valor |
|---|---|
| Branch analisada | `origin/Sprint-2` (o pedido cita `sprint-dois`; essa branch não existe no remoto, `Sprint-2` é a única) |
| Último commit | `6c809fc` (6 commits: Duda e Maria Eduarda, 06/10) |
| Base comum com a `main` | `3752789` |
| `main` no momento da análise | `5e541cd` |
| Tamanho | 45 arquivos, +4093 / −195 linhas (27 modificados, 18 novos) |
| Data da análise | 07/10/2026 |
| Escopo pedido | US09, US10, US12, US13 e US26 (CC06) |

---

## 1. Resumo executivo

**Veredito: a branch é uma base sólida e deve ser aproveitada quase inteira.** O trabalho do Sprint 2 já existe, passa em todos os testes e funciona no MySQL real. O que falta não é "fazer o Sprint 2", e sim **corrigir 2 defeitos reais, fechar lacunas de demonstração e endurecer pontos de risco**.

- **Testes:** 192 critérios passam, 0 falham (107 do Sprint 1 + 85 do Sprint 2). Build do front ok. Instalação limpa ok.
- **Teste ao vivo em MySQL** (porque os testes automáticos usam SQLite): 49 de 49 verificações ok, em todas as cinco histórias.
- **Mapa dos critérios** ("O que poderá ser testado", 17 itens das 5 histórias): **15 completos, 2 parciais, 0 ausentes.** Os 2 parciais dependem de histórias de outros sprints (aceite US11 e conclusão US20) e só se demonstram com dado simulado.
- **Dois defeitos reais, provados ao vivo** (seção 5):
  1. **ALTA-1:** uma conta com serviço em aberto consegue se desativar (HTTP 200); o bloqueio da US04 nunca foi ligado aos serviços.
  2. **ALTA-2:** depois de trocar a senha logado (US26), um link de recuperação pedido antes **continua valendo** e permite tomar a conta.
- **Merge:** simulado com `git merge-tree`, **sem conflitos** com a `main` atual.

---

## 2. O que a branch adiciona (diff `main...Sprint-2`)

| Área | O que entra | Arquivos principais |
|---|---|---|
| **US09 Busca** | Filtros por categoria e bairro, ordenação por nota e por concluídos, cartão com nota/concluídos/selo, índices compostos | `prestadorController.listar`, `PrestadorBairro.js`, `PrestadorCategoria.js`, `Prestadores.jsx` (reescrita) |
| **US10 Pedido e orçamento** | Modelo `Servico`, criar pedido com até 3 fotos, orçamento (valor, prazo, taxa), recusa, lista | `Servico.js`, `servicoController.js`, `PedirOrcamento.jsx`, `ServicoDetalhe.jsx`, `Servicos.jsx` |
| **US12 Chat** | Modelo `Mensagem`, texto e imagem, só as duas partes, retenção de mídias (90 dias) | `Mensagem.js`, `Chat.jsx`, `ImagemProtegida.jsx`, `retencaoMidias.js` |
| **US13 Agenda** | Data e hora no pedido e na proposta, bloqueio de horário ocupado, agenda, lembrete na véspera | `servicoController.agenda`, `lembretes.js`, aba "Agenda" em `Servicos.jsx` |
| **US26 (CC06)** | `PUT /conta/senha`, cartão "Senha" em Minha conta | `contaController.trocarSenha`, `MinhaConta.jsx` |
| **Apoio** | Remoção de metadados (GPS) das imagens, pasta privada de arquivos, e-mails de lembrete, dados de demonstração | `metadados.js`, `armazenamento.js`, `upload.js`, `email.js`, `demo.js` |
| **Banco** | Tabelas `servicos` e `mensagens`; colunas `nota_media` e `verificado` em `prestadores`; `schema.sql` atualizado | `schema.sql`, `models/*` |
| **Testes e docs** | +494 linhas de testes, `ALTERACOES.md`, `README.md`, `.env.example`, "Checklist Sprint 2 Fechô.md" | `testes/criterios.js` |

Não há dependências novas (as mesmas da `main`).

---

## 3. Execução: instalar, rodar e testar

| Verificação | Resultado |
|---|---|
| `npm install` limpo (backend e frontend) | Ok (backend 12 s, frontend 3 s) |
| Suíte de testes `npm run teste` | **192 critérios, 0 falhas** |
| Build do front (`vite build`) | Ok (74 módulos, 233 kB de JS) |
| `schema.sql` rodado num banco MySQL temporário | Ok, **12 tabelas** criadas |
| API em **MySQL** (sync, seed e demo) | Sobe, cria as 12 tabelas, o lembrete da véspera dispara no console |
| Teste ao vivo das 5 histórias (curl contra a API em MySQL) | **49 de 49 ok** |
| Simulação de merge na `main` (`git merge-tree`) | **Sem conflitos** |
| Cobertura de código | **Não existe** (nenhuma ferramenta configurada) |
| Testes do front-end | **Nenhum** (0 arquivos) |
| Lint | **Não existe** |
| `npm audit` | Backend: 14 vulnerabilidades (1 crítica, 9 altas); só dependências de produção: 3 (1 alta, `nodemailer`; 2 moderadas). Front: 5 (2 altas, `vite`/`source-map-js`). **São as mesmas dependências da `main`**; o Sprint 2 não acrescentou nenhuma. |

### Testes automáticos por história

| História | Critérios no teste |
|---|---|
| US09 Busca | 14 |
| US10 Pedido e orçamento | 30 (8 + 7 de fotos + 15 de orçamento) |
| US12 Chat | 16 (12 + 4 de retenção de mídias) |
| US13 Agendamento | 14 |
| US26 Trocar senha | 8 |
| US02 "usuário A não acessa serviço do B" | 3 |
| **Total novo** | **85** |

**Qualidade dos testes:** são verificações reais, não superficiais (por exemplo, enviam um JPEG com coordenadas GPS e conferem que sumiram; conferem a ordenação por nota e o desempate por concluídos; conferem a existência do índice). **Lacunas:** não há teste de concorrência, nem do critério "serviço já aceito continua durante a pausa", nem de interface.

**Observação importante:** os testes rodam em **SQLite em memória**, mas a produção usa **MySQL**. Eu rodei a API de verdade em MySQL e não achei diferença de comportamento, mas nada garante isso no futuro sem uma rodada automática em MySQL.

---

## 4. Mapa dos critérios "O que poderá ser testado"

Legenda: **Completo** = implementado e demonstrável no site · **Parcial** = implementado, mas só demonstrável com dado simulado ou dependente de outra história · **Ausente** = não existe.

### US09 Busca por categoria e bairro

| Item testável | Situação | Evidência |
|---|---|---|
| A busca retorna apenas prestadores da categoria e do bairro escolhidos | **Completo** | `listar` (dois passos); testes "busca por categoria / por bairro / juntos"; ao vivo ok |
| Busca sem resultado exibe mensagem orientando o usuário | **Completo** | `Prestadores.jsx` (`orientacao()` com título, texto e botões "Procurar em todos os bairros" / "Ver todos os serviços"); API devolve lista vazia |
| Prestador pausado ou suspenso não aparece no resultado | **Completo** | `where status 'ativo'`; testes "pausado" e "suspenso" |

*Tarefas do cartão:* endpoint ok · ordenação por nota e por concluídos ok · cartão (nome, nota, concluídos, selo) ok · índices ok (compostos em `prestador_categorias` e `prestador_bairros`, testados).
*Atenção:* a **nota média** e o **selo** são lidos de colunas que nenhuma funcionalidade preenche ainda (US24 e US06). Ao vivo, só aparecem com os dados de `db:demo`.

### US10 Solicitação de serviço e orçamento

| Item testável | Situação | Evidência |
|---|---|---|
| A solicitação aparece na lista de pendências do prestador | **Completo** | Aba "Pedidos" com contador de pendentes; ao vivo ok |
| O orçamento chega ao contratante com valor, prazo e deslocamento separados | **Completo** | `montarServico.orcamento` e o "comprovante" na tela; ao vivo ok |
| Valor zerado ou negativo é recusado pelo sistema | **Completo** | Recusa no backend e no formulário; ao vivo ok (zero e negativo) |
| O contratante consegue recusar e o serviço é encerrado | **Completo** | `recusar`; status `recusado`, `encerrado_em` marcado; ao vivo ok |

*Tarefas do cartão:* tabela `servicos` ok · `POST /api/servicos` com fotos ok (até 3 fotos, 2 MB, GPS removido) · tela do prestador com taxa quando fora da área ok · status "Aguardando orçamento", "Orçamento enviado" e "Recusado" ok.

### US12 Chat interno do serviço

| Item testável | Situação | Evidência |
|---|---|---|
| Um terceiro usuário não consegue abrir o chat daquele serviço | **Completo** | 404 para quem não é parte (ao vivo ok, inclusive no envio e no arquivo) |
| As mensagens ficam salvas e podem ser consultadas em caso de disputa | **Completo** | Persistidas e relidas, inclusive depois do encerramento; consulta incremental `?depois=` |
| O chat encerra o envio de novas mensagens após a conclusão do serviço | **Parcial** | Fecha ao vivo quando o serviço é **recusado**. Fechar por **conclusão** só se demonstra com dado simulado, porque a conclusão é a US20 |

*Tarefas do cartão:* tabela `mensagens` ok · tela com texto e imagem ok · só as duas partes ok · prazo de retenção das mídias ok (90 dias, rotina diária, 4 testes).

### US13 Agendamento de data e hora

| Item testável | Situação | Evidência |
|---|---|---|
| Não é possível agendar dois serviços no mesmo horário para o mesmo prestador | **Completo** (com ressalvas M-2 e M-3) | 409 ao vivo; 30 propostas concorrentes não geraram duplicidade |
| Data no passado é recusada | **Completo** | Backend e front (`min` do campo e checagem) |
| O compromisso aparece na agenda dos dois lados após o aceite | **Parcial** | A agenda e os testes existem, mas o **aceite é a US11**, que não existe; só aparece com os dados de `db:demo` |

*Tarefas do cartão:* data e hora na solicitação e na proposta ok · agenda no painel ok (aba "Agenda", para os dois perfis) · bloqueio de horário ok · lembrete na véspera para as duas partes ok (rotina de hora em hora, e-mail ou console; só vale para status `aceito`, ou seja, também depende da US11).

### US26 (CC06) Alterar a senha estando logado

| Item testável | Situação | Evidência |
|---|---|---|
| Senha atual incorreta é recusada | **Completo** | 400 (de propósito não é 401, para o front não encerrar a sessão) |
| Nova senha fraca ou igual à atual é recusada | **Completo** | Ao vivo ok (fraca e igual) |
| Após a troca, a senha antiga não funciona e as outras sessões deixam de valer | **Completo** (com o defeito ALTA-2) | `token_versao`; token antigo dá 401 |
| A sessão em que a troca foi feita continua ativa | **Completo** | Devolve token novo; ao vivo ok |

### Critérios do Sprint 1 que o Sprint 2 destravaria

| Critério | Situação |
|---|---|
| US02: usuário A não acessa, pela URL, um serviço do usuário B | **Completo** (3 testes; ao vivo 404 em detalhe, mensagens, envio e arquivo) |
| US04: usuário com serviço em andamento recebe recusa explicando o motivo | **Ausente** (defeito ALTA-1: o verificador de serviços nunca foi registrado) |
| US07: serviços já aceitos continuam normalmente durante a pausa | **Não coberto por teste** (por construção a pausa não mexe nos serviços; falta o teste) |
| US08: "atendo apenas mulheres" vale também para o pedido | **Completo** (403, com teste) |

### Placar

| História | Itens testáveis | Completos | Parciais | Ausentes |
|---|---|---|---|---|
| US09 | 3 | 3 | 0 | 0 |
| US10 | 4 | 4 | 0 | 0 |
| US12 | 3 | 2 | 1 | 0 |
| US13 | 3 | 2 | 1 | 0 |
| US26 | 4 | 4 | 0 | 0 |
| **Total** | **17** | **15** | **2** | **0** |

---

## 5. Revisão de código: achados

Gravidade: **Alta** (corrigir antes de apresentar ou entregar), **Média** (corrigir no sprint), **Baixa** (melhoria). Os dois itens "Alta" foram **provados ao vivo**.

### Alta

**ALTA-1. Conta com serviço em aberto consegue se desativar** *(provado)*
- **Onde:** `backend/src/servicos/pendencias.js` (o mecanismo existe, mas **nenhum verificador de serviço é registrado**); `contaController.desativar` e `excluirDefinitivo`.
- **Prova:** o prestador "Eli" tinha 2 serviços em aberto (`aceito` e `aguardando_orcamento`). A API devolveu `pode_desativar: true` e a desativação respondeu **HTTP 200**. O pedido de outra pessoa com ele continuou aberto.
- **Impacto:** serviço de terceiros fica com uma parte inativa, chat aberto sem resposta, e o critério da US04 ("serviço em andamento recebe recusa explicando o motivo") não é atendido.
- **Correção:** registrar um verificador de serviços (a lista de status a bloquear precisa ser decidida; sugestão: `aguardando_orcamento`, `orcamento_enviado`, `aceito`, `em_execucao`, `concluido`, `em_disputa`), com teste e item no guia.

**ALTA-2. Link de recuperação pedido antes continua válido depois da troca de senha (US26)** *(provado)*
- **Onde:** `contaController.trocarSenha`. A redefinição da US03 invalida os outros links pendentes, mas a troca da US26 não.
- **Prova:** pedi o link da Ana, ela trocou a senha logada (200), e usei o link antigo: **HTTP 200** e login com a senha escolhida pelo link (**HTTP 200**). No controle, o mesmo fluxo pela US03 invalida o outro link (HTTP 400).
- **Impacto:** quem tem acesso a um link de recuperação ainda válido (30 minutos) toma a conta mesmo depois de a dona trocar a senha. Contradiz o objetivo da US26.
- **Correção:** ao trocar a senha, marcar como usados os `TokenSenha` pendentes do usuário (uma linha, igual ao `redefinirSenha`), com teste.

### Média

| ID | Achado | Onde | Recomendação |
|---|---|---|---|
| **M-1** | **Sem limite de requisições nem cotas.** Dá para tentar a senha atual sem freio (com token roubado), criar pedidos sem limite (cada um grava até 3 fotos de 2 MB no disco), e inundar o chat | rotas em geral | Limite por IP/usuário nas rotas sensíveis; limite de pedidos pendentes por contratante; cota de disco |
| **M-2** | **Possível corrida na agenda (US13).** A checagem `horarioOcupado` e a gravação não têm transação nem trava. **Não consegui reproduzir** (5 rodadas × 6 propostas simultâneas, todas barradas com 409), mas o desenho permite | `servicoController.enviarOrcamento`, `horarioOcupado` | Transação com trava de linha no prestador; teste de concorrência |
| **M-3** | **Orçamento enviado ocupa o horário sem prazo de validade.** O status `expirado` existe, mas nenhuma rotina o usa; um orçamento ignorado bloqueia a agenda para sempre. Pedidos `aguardando_orcamento` também nunca expiram e o contratante não pode cancelá-los | `Servico.STATUS_OCUPAM_HORARIO`, `horarioOcupado` | Validade do orçamento + rotina de expiração; decidir com o cliente |
| **M-4** | **"Apagar meus dados" (LGPD) não alcança mensagens e fotos dos serviços.** A guarda de 90 dias só passa a contar quando o serviço encerra; serviço aberto = guarda indefinida. O texto livre do chat pode identificar a pessoa | `anonimizacao.js` (sem mudança), `retencaoMidias.js` | Documentar a base legal da guarda e/ou anonimizar o texto; depende da correção ALTA-1 |
| **M-5** | **Testes só em SQLite** (produção é MySQL); sem testes do front, sem lint, sem cobertura, sem teste de concorrência | `testes/criterios.js` | Rodada automática em MySQL; testes de front; medir cobertura |
| **M-6** | **Sem paginação**: busca, `/servicos` e mensagens devolvem tudo; a ordenação da busca é feita em memória | `listar`, `servicos`, `mensagens` | Paginar e limitar |
| **M-7** | **Polling de 3 s por chat aberto:** cada rodada faz busca do usuário, carrega o serviço com 3 junções e consulta mensagens | `Chat.jsx`, `carregarDaParte` | Intervalo adaptativo/ETag agora; SSE ou WebSocket no futuro |
| **M-8** | **CORS vira `*` se `URL_FRONT` faltar**; `db:demo` não tem trava de produção e cria contas com senha conhecida (`demo1234`) | `app.js`, `demo.js` | Exigir `URL_FRONT` em produção; recusar `db:demo` quando `NODE_ENV=production` |
| **M-9** | **Enum de status com 12 valores via `sync()`:** mudanças futuras exigem `ALTER TABLE` manual | `Servico.js` | Migrações versionadas (o CC11) |

### Baixa

| ID | Achado | Recomendação |
|---|---|---|
| **B-1** | **Fuso horário:** `demo.js` usa `setHours` no fuso do servidor, enquanto a tela e os e-mails usam `America/Sao_Paulo`; datas sem fuso enviadas por cliente de API são lidas no fuso do servidor | Fixar o fuso nas duas pontas |
| **B-2** | `lerDinheiro` do backend não aceita `1.234,56` (a mensagem de erro engana); a regra está duplicada no front | Alinhar as duas |
| **B-3** | `servicoController.js` (510 linhas) mistura pedido, orçamento, agenda e chat | Dividir em controllers ou serviços |
| **B-4** | **Acessibilidade (lida no código, não testada com leitor de tela):** modais sem prisão de foco nem retorno de foco; imagem ampliada sem `Esc`; `aria-live` na lista inteira do chat; o chat engole erros do polling (sem aviso de falha de rede) e mostra "nenhuma mensagem" antes da primeira resposta; imagens baixadas por inteiro, sem miniatura | Ajustes pontuais no front |
| **B-5** | Token de login no `localStorage` (herdado do Sprint 1): exposto a XSS; sem política CSP | Avaliar cookies `HttpOnly` e CSP |
| **B-6** | Documentação: `Checklist Sprint 2 Fechô.md` está truncado (termina em "0 de 0", sem as seções finais que ele mesmo anuncia); nome com acento e espaço | Regerar o arquivo |
| **B-7** | Colunas `nota_media` e `verificado` voltaram a existir, mas sem origem real (US24 e US06): ficam vazias fora do demo | Registrado; é o que o cartão da US09 pede |
| **B-8** | `npm audit` aponta vulnerabilidades já presentes na `main` (ver seção 3) | Etapa própria de atualização, com teste depois |

### Pontos fortes (para manter)

- **Acesso restrito bem feito:** qualquer serviço de outra pessoa responde 404, sem revelar que existe.
- **Upload cuidadoso:** formato conferido pelos bytes, **GPS/EXIF removido** (com teste), pasta **privada** de arquivos, `nosniff`, nome do arquivo validado (tentativa de *path traversal* recusada ao vivo).
- **Rotinas testáveis:** retenção, lembretes e retenção de mídias recebem a data como parâmetro, então os testes simulam o tempo.
- **Estados da busca:** esqueleto de carregamento, vazio com orientação e erro.
- **Rastreabilidade:** o `ALTERACOES.md` liga cada linha de cada cartão ao arquivo e ao teste.
- **Banco:** índices compostos para os filtros; `schema.sql` válido em MySQL.

---

## 6. O que aproveitar e o que refazer

### Aproveitar como está (a maior parte)

Modelos `Servico`/`Mensagem`, busca e ordenação (US09), fluxo de pedido e orçamento (US10), chat e retenção de mídias (US12), agenda e lembretes (US13), telas de busca/pedido/serviço/agenda/chat, remoção de metadados, armazenamento privado, testes, `schema.sql`.

### Corrigir ou completar (mudanças pequenas e localizadas)

| O quê | Tamanho |
|---|---|
| Verificador de serviços nas pendências (ALTA-1) | Pequeno |
| Invalidar links de recuperação na troca de senha (ALTA-2) | Muito pequeno |
| Transação na agenda e teste de concorrência (M-2) | Pequeno |
| Validade do orçamento e expiração (M-3) | Médio, e exige decisão do cliente |
| Trava de produção no `db:demo` e CORS (M-8) | Muito pequeno |
| Guia de apresentação com todos os itens testáveis, incluindo os 2 parciais | Médio |

### Refazer do zero

**Nada.** Não há parte da branch que mereça ser descartada.

---

## 7. Melhorias priorizadas

**Alta:** ALTA-1 (serviços na exclusão de conta) · ALTA-2 (links de recuperação após troca de senha).

**Média:** M-2 (transação na agenda) · M-3 (expiração de orçamento) · M-1 (limites) · M-4 (privacidade das mídias) · M-5 (testes em MySQL e de front) · M-8 (CORS e `db:demo`).

**Baixa:** M-6, M-7, M-9, B-1 a B-8.

---

## 8. Riscos

1. **Demonstração ao cliente dos 2 critérios parciais.** O cliente acompanha pelos critérios; ver o compromisso na agenda "após o aceite" e o chat fechar "após a conclusão" não é possível ao vivo sem US11 e US20. **Opções:** (a) manter o `db:demo` e declarar que o dado é simulado (o que a branch faz hoje); (b) criar um **auxiliar só de desenvolvimento** (rota ou botão de "simular aceite/conclusão", desligado em produção), que permitiria mostrar ao vivo sem implementar as histórias futuras. Decisão do cliente e do grupo.
2. **A branch parte de uma base antiga** (`3752789`): hoje não há conflito, mas quanto mais a `main` andar, maior o risco.
3. **O desenho de agenda ocupa horário com orçamento não aceito**: pode ser percebido como bug pelo cliente (prestador "ocupado" sem compromisso).
4. **Privacidade (M-4):** o cliente pode perguntar o que acontece com mensagens e fotos quando a pessoa pede exclusão.
5. **Dívida de processo:** testes só em SQLite, sem front testado e sem cobertura.
6. **Dependências com vulnerabilidades conhecidas:** já existem na `main`, mas passam a pesar mais com serviços e arquivos.

---

## 9. Limites desta análise

- **Não abri a interface em navegador** (não há automação de navegador neste ambiente): o front foi avaliado por leitura de código, build e requisições à API. A acessibilidade e a responsividade foram lidas no código, **não testadas com leitor de tela, teclado ou dispositivos**.
- A corrida na agenda **não foi reproduzida**; isso não prova que ela não exista.
- **Não testei carga** nem o envio real de e-mail (sem SMTP; os e-mails saem no console).
- **`npm audit` não foi seguido de correção**; as vulnerabilidades estão só listadas.
- A leitura do código cobriu o back-end novo quase por completo e os componentes principais do front (chat, pedido, detalhe, busca); `Servicos.jsx` e os arquivos de CSS foram vistos por busca, não linha a linha.
- O ambiente temporário foi desmontado: API da porta 3334 encerrada e banco `fecho_analise` apagado. O banco real `fecho` segue intacto.
