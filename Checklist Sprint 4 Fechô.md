# Checklist do Sprint 4

Cada linha do "O que será feito" e cada critério de aceite dos cartões US20, US24, US15, US21, US14 e US16, com o teste automático que prova e o lugar para ver na tela.

**Antes de começar**

1. `cd backend && npm run teste` → esperado: **320 critérios, 0 falhas**.
2. `npm run db:demo -- --recriar` (as datas partem de agora: o serviço da Rita fica marcado para daqui a 30 minutos) e `npm run dev`; no front, `npm run dev`.
3. Contas de demonstração, todas com a senha `demo1234`:

| Conta | Para conferir |
| --- | --- |
| `rita.demo@fecho.app` | Cheguei, Iniciar e Concluir o serviço "Trocar a torneira" (daqui a 30 min); repasse a 6% (já tem 20 serviços); Meu perfil → Sua taxa no Fechô |
| `ana.demo@fecho.app` | Confirmar a torneira (depois da Rita) e o disjuntor (Eli); cancelar; pedir nova data no "Vazamento" (amanhã); avaliar o Joao (pintura do portão); Meus serviços → Quem já me atendeu |
| `eli.demo@fecho.app` | Repasse esperando a chave Pix depois que a Ana confirmar o disjuntor; cadastrar a chave ao vivo (o `db:demo` imprime o CPF) |
| `bruno.demo@fecho.app` | Ventilador com o Eli daqui a 5 dias: cancelar com mais de 24 horas (estorno de 100%) |
| `joao.demo@fecho.app` | Avaliar a Ana (avaliação mútua) |

---

## US20 — Conclusão do serviço e repasse · 13 pontos

| Item do card | Teste (`npm run teste`) | Na tela |
| --- | --- | --- |
| Ação do prestador para marcar como Concluído (e, antes, Iniciar) | "o prestador inicia: o servico vai para Em execucao"; "o prestador marca Concluido e o contratante ganha 72 horas para confirmar" | Rita → torneira → Iniciar serviço → Marcar como concluído |
| Ação do contratante para confirmar | "a confirmacao libera o valor descontada a taxa vigente" | Ana → torneira → Confirmar que o serviço foi feito |
| Calcular a taxa e transferir o líquido | idem + "a taxa vale so sobre o servico" | Rita → torneira: R$ 90 − 6% (R$ 5,40) = R$ 84,60 |
| Confirmação automática após 72 horas | "antes das 72 horas, o servico continua esperando"; "sem confirmacao dentro do prazo, o valor e liberado automaticamente" | Ao vivo: `CONFIRMACAO_HORAS=0.05` no `.env` (3 minutos) |
| Conferir a chave Pix (CPF do cadastro) antes do repasse | "sem chave Pix conferida ... o repasse fica pendente"; "ao cadastrar a chave ... o repasse pendente sai na hora" | Ana confirma o disjuntor → Eli vê "Falta a sua chave Pix" → cadastra → recebe |
| **Critério:** a confirmação libera o valor descontada a taxa | idem | idem |
| **Critério:** sem confirmação no prazo, libera sozinho | idem | idem |
| **Critério:** o prestador não libera o próprio pagamento | "o prestador nao consegue liberar o proprio pagamento sozinho" | O prestador não tem botão de confirmar; a API responde 403 |
| **Critério:** a taxa fica registrada e consultável por serviço | "o valor da taxa fica registrado e consultavel por servico" | Rita → serviço pago: quadro com a taxa e o valor recebido |

## US24 — Avaliação mútua · 8 pontos

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Tabela Avaliacoes com nota e comentário, para os dois lados | "o prestador avalia o cliente (avaliacao mutua)" | Ana e Joao → pintura do portão → Avaliação |
| Liberar só depois das duas, ou no fim do prazo (7 dias) | "a avaliacao de um lado nao aparece antes..."; "vencido o prazo de 7 dias..." | Ana avalia: "aparece quando Joao avaliar"; Joao avalia: as duas aparecem |
| Edição em até 24 horas e resposta do prestador | "nas primeiras 24 horas a avaliacao pode ser editada"; "o prestador responde (uma vez)" | Botão Editar avaliação; campo Responder |
| Média (simples) e consequências só com 5 avaliações | "a nota do prestador e a media simples..."; "prestador com menos de 5 avaliacoes nao sofre queda" | Busca: Rita 4,6 (8 avaliações) antes de Eli 4,0 (1 avaliação: não conta na ordem) |
| **Critério:** só quem contratou e teve o serviço confirmado avalia | "so quem teve o servico confirmado consegue avaliar"; "quem nao contratou nao avalia" | Em serviço aceito não aparece o quadro de avaliação |
| **Critério:** a avaliação de um lado não aparece antes da outra | idem | idem |
| **Critério:** depois de 24 horas, não edita mais | "apos 24 horas, a avaliacao nao pode mais ser editada" | O botão Editar some depois do horário mostrado |
| **Critério:** com menos de 5 avaliações, não cai na busca | "prestador com menos de 5 avaliacoes nao sofre queda de posicao na busca" | — |
| Ver as avaliações dos outros | "o contratante ve as avaliacoes dos outros no perfil publico" | Profissionais → Ver avaliações no cartão |

## US15 — Cancelamento e estorno · 5 pontos

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Cancelamento com motivo e quem cancelou | "o cancelamento exige o motivo"; "o cancelamento registra o motivo e quem cancelou" | Botão Cancelar serviço → motivo |
| Regra pela antecedência (tabela do grupo) | "fora do prazo (menos de 24 horas)..."; "com o prestador no local, ... 50% / 50%"; "quando o prestador cancela, o cliente recebe 100%" | Ana → Vazamento (amanhã): prévia 70% R$ 98 / 30% R$ 42 |
| Estorno no gateway e status do pagamento | "cancelamento dentro do prazo (mais de 24 horas) gera estorno integral" | Bruno → Ventilador: devolvidos R$ 175 |
| Contabilizar cancelamentos no histórico do usuário | "os cancelamentos ficam contados no historico de quem cancelou" | Minha conta → Serviços que você cancelou |
| **Critério:** dentro do prazo, estorno integral | idem | idem |
| **Critério:** fora do prazo, aplica a regra e informa o valor | "antes de cancelar, o sistema informa quanto cada um recebe" | A prévia aparece antes de confirmar |
| **Critério:** serviço concluído não é cancelado | "servico ja concluido nao pode ser cancelado"; "com o servico em execucao nao existe cancelamento (so disputa)" | O botão some do Em execução em diante |

## US21 — Taxa decrescente por volume · 3 pontos

| Item do card | Teste | Na tela |
| --- | --- | --- |
| 8%, 6% depois de 20 e 5% depois de 50 | "faixas: 8% ate o 20o servico, 6% do 21o ao 50o, 5% do 51o em diante" | Meu perfil → Sua taxa no Fechô |
| Calcular no repasse, pelo total de concluídos | "o 20o servico concluido ainda paga 8%" | Rita: torneira cobrada a 6% |
| Faixa atual e quanto falta no painel | "o painel mostra a faixa atual e a proxima" | Rita: "6%... Faltam 29 para 5%" |
| Registrar a taxa em cada transação | "a taxa aplicada fica registrada em cada transacao" | Tabela `pagamentos`: `taxa_percentual` e `taxa_valor` |
| **Critério:** o 21º serviço já paga 6% | "o 21o servico concluido ja e cobrado a 6%" | Torneira da Rita |
| **Critério:** cancelados e em disputa não contam | "servicos cancelados ou em disputa nao contam para o total" | — |
| **Critério:** o painel mostra a faixa atual e a próxima | "o painel mostra corretamente a faixa atual e a proxima" | Meu perfil |

## US14 — Reagendamento · 3 pontos

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Propor nova data, com aceite da outra parte | "o prestador propoe uma nova data"; "o contratante tambem pode propor"; "quem propos nao aceita a propria proposta" | Ana → Vazamento → Pedir nova data; Rita aceita ou recusa |
| Valor retido durante a análise | "o valor permanece retido enquanto o reagendamento esta em analise" | O quadro "Pagamento congelado" continua |
| Histórico: quem propôs e quando | "o historico do servico registra quem propos e quando" | Histórico do serviço (no fim da página) |
| Limite por serviço (3) | "o servico pode ser reagendado no maximo 3 vezes" | Depois da 3ª, aparece o aviso do limite |
| **Critério:** só vale depois do aceite | "o reagendamento so vale depois do aceite da outra parte" | A data só muda depois de Aceitar |
| **Critério:** valor retido o tempo todo | idem + "o valor continua retido depois do reagendamento" | — |
| **Critério:** recusa mantém a data e a opção de cancelar | "a recusa mantem a data original e a opcao de cancelar" | Recusar → a data fica; Cancelar serviço continua |

## US16 — Histórico e recontratação · 3 pontos

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Tela de histórico do contratante | "o historico lista os servicos feitos com data, valor e avaliacao" | Ana → Meus serviços → Quem já me atendeu |
| Botão "chamar de novo" com pedido preenchido | "chamar de novo abre uma nova solicitacao com o prestador ja selecionado" | Chamar de novo → descrição e bairro já preenchidos |
| Data, valor e avaliação | idem | Cada linha mostra data, valor e estrelas |
| Filtro por categoria | "o historico pode ser filtrado por categoria" | Filtro "Tipo de serviço" |
| **Critério:** abre com o prestador já selecionado | idem | idem |
| **Critério:** quem saiu aparece, sem o botão | "prestador que saiu da plataforma aparece no historico, mas sem o botao" | Lia Demo: "Não está mais no Fechô" |
| **Critério:** só os serviços do próprio usuário | "o historico mostra apenas os servicos do proprio usuario" | — |

---

## Ainda não existe (Sprint 5)

Disputa (US23) e decisão do administrador (US25). Repasse e estorno no Asaas de verdade: testar no sandbox antes da apresentação.
