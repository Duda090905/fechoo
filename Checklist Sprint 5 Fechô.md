# Checklist do Sprint 5 (sprint final)

Cada linha do "O que será feito" e cada critério de aceite dos cartões US23, US25, US19 e US22, com o teste automático que prova e o lugar para ver na tela. Com eles, as 25 histórias do backlog (mais o curinga US26) estão entregues.

**Antes de começar**

1. `cd backend && npm run teste` → esperado: **409 critérios, 0 falhas** (83 novos neste sprint).
2. `npm run db:demo -- --recriar` (as datas partem de agora) e `npm run dev`; no front, `npm run dev`.
3. Contas de demonstração, todas com a senha `demo1234`:

| Conta | Para conferir |
| --- | --- |
| `admin.demo@fecho.app` | **Painel**: decidir a disputa da pintura (Bruno × Joao, R$ 400 congelados, com defesa); suspender e reativar um profissional; Relatório; Registro (já tem uma decisão antiga) |
| `bruno.demo@fecho.app` | **Abrir disputa** no serviço "Trocar a resistência do chuveiro" (Rita concluiu há 2 horas); **aceitar e pagar** a proposta complementar de R$ 90 no "Trocar o registro do chuveiro" (em execução) |
| `rita.demo@fecho.app` | **Extrato** (repasses, um com valor complementar, a parte de uma disputa dividida, valores congelados, exportar CSV); **propor complementar** no serviço "Trocar a torneira" (daqui a 30 min) depois do Cheguei; responder à disputa que o Bruno abrir |
| `joao.demo@fecho.app` | Ver a disputa da pintura do lado do profissional, com a decisão depois que o admin decidir |

O `db:demo` imprime os números dos serviços. Para pagar o Pix complementar depois de aceitar: `npm run pix:pagar -- <id do serviço>`. Para criar um administrador de verdade: `npm run admin:criar -- --email ... --senha ...`.

---

## US23 — Abertura de disputa

| Item do card | Teste (`npm run teste`) | Na tela |
| --- | --- | --- |
| Tabela Disputas com justificativa e evidências | "o contratante abre a disputa com justificativa e evidencias (2 fotos)"; "disputa sem justificativa (ou curta demais) e recusada"; "evidencia que nao e imagem e recusada" | Bruno → chuveiro → **Algo deu errado?** → Abrir disputa (texto + até 3 fotos) |
| Abertura em até 72 horas após concluído | "fora das 72 horas depois de concluido a disputa nao abre"; "dentro das 72 horas (71 horas depois) a disputa abre"; "com o servico em execucao ... a disputa tambem abre" | O cartão mostra "Você pode abrir até ..." |
| Congelar o valor | "a disputa congela o valor: servico Em disputa e pagamento continua Retido" | Status **Em disputa**; Meus serviços → grupo "Em disputa" |
| Defesa do prestador | "o prestador responde a disputa com a defesa e evidencias"; "a defesa e enviada uma vez so"; "a defesa e do prestador e precisa de texto" | Rita → chuveiro → **A sua defesa** |
| **Critério:** impede a liberação automática | "a disputa impede a liberacao automatica (a rotina das 72 horas nao toca o servico)" | — |
| **Critério:** fora de 72 h não abre | idem acima | Depois do prazo o cartão "Algo deu errado?" some |
| **Critério:** o contratante não estorna sozinho | "o contratante nao estorna sozinho (confirmar, cancelar e decidir sao recusados)"; "o prestador tambem nao libera o valor sozinho" | Nenhum botão de dinheiro aparece durante a disputa |
| **Critério:** o prestador é notificado e responde | "o prestador e notificado da disputa"; "o contratante e avisado da defesa" | Aviso no sino + e-mail (console sem SMTP) |
| Extra: provas preservadas | "as evidencias so abrem para as partes (terceiro recebe 404)"; "com a disputa aberta, a rotina de guarda das midias nao apaga as provas" | — |

## US25 — Painel do administrador

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Fila de disputas com evidências | "a fila mostra as disputas abertas, com valor congelado e evidencias"; "a fila vem da mais antiga para a mais nova"; "o administrador ve as evidencias das duas partes, o chat, o historico e as partes"; "o administrador abre as fotos das evidencias" | Admin → Painel → Disputas → abrir a disputa |
| Decisões devolver / liberar / dividir com justificativa | "decidir devolver gera o estorno integral"; "decidir liberar gera a transferencia ao prestador, ja sem a taxa"; "dividir estorna 60% e transfere 40%"; "decisao sem justificativa, desconhecida ou divisao fora de 1-99% e recusada"; "sem defesa, a decisao espera o prazo de 48 horas do prestador" | Cartão **Decidir**: escolher, ver a prévia de quanto cada um recebe, justificar e registrar |
| Suspensão preventiva | "suspensao preventiva: o perfil fica suspenso e o registro guarda autor e justificativa"; "a suspensao exige justificativa"; "o administrador retira a suspensao e o prestador volta a busca" | Painel → Profissionais → Suspender |
| Relatório | "o relatorio mostra as disputas por decisao e o dinheiro devolvido e liberado"; "o relatorio traz os servicos por status, as taxas e os suspensos"; "o relatorio filtra pelo periodo e recusa data em outro formato" | Painel → Relatório |
| **Critério:** a decisão gera estorno ou transferência | os três testes de decisão | Comprovante na tela do serviço; Painel → Pagamentos |
| **Critério:** só o administrador acessa | "so o administrador acessa o painel (os outros perfis recebem 403, sem login 401)"; "ninguem vira administrador pelo cadastro do site"; "so o administrador suspende" | O menu "Painel" só aparece para o administrador |
| **Critério:** suspenso sai da busca e não recebe pedidos | "o suspenso sai da busca"; "o suspenso nao recebe pedidos (nem fecha orcamento de pedido antigo)"; "o suspenso nao sai da suspensao sozinho e ve o motivo no proprio perfil" | Suspender a Rita e procurar eletricista; Rita → Meu perfil mostra o motivo |
| **Critério:** decisão registrada com autor, data e justificativa | "a decisao fica registrada com autor, data e justificativa"; "o registro de decisoes mostra as tres, com quem decidiu, quando e por que"; "uma disputa decidida nao e decidida de novo" | Painel → Registro |

## US19 — Proposta complementar

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Justificativa e foto obrigatórias | "justificativa e foto sao obrigatorias"; "o contratante ve a proposta com valor, justificativa e a foto" | Rita → torneira → Cheguei → **Propor valor complementar** |
| Máximo de 50% do original e uma por serviço | "acima de 50% do valor original e recusada (100,01 sobre 200)"; "proposta de exatamente 50% ... e aceita"; "nao existe segunda proposta complementar no mesmo servico" | O cartão mostra o máximo permitido |
| Pix adicional retido após o aceite | "aceita a proposta, o Pix adicional sai com exatamente o valor complementar"; "clicar de novo devolve o mesmo Pix"; "com o Pix pago, o valor complementar fica retido junto com o original"; "na confirmacao, o original e o complementar sao liberados com a mesma taxa" | Bruno → registro do chuveiro → Aceitar e pagar R$ 90 → `npm run pix:pagar -- <id>` |
| Métrica no perfil | "a metrica no perfil e atualizada (propostas complementares / servicos aceitos)" | Busca: "Pediu valor extra em X% dos serviços"; Meu perfil → Seus recebimentos |
| **Critério:** acima de 50% é recusada | idem | Erro com o valor máximo |
| **Critério:** a recusa mantém o original e o valor retido | "a recusa mantem o orcamento original e o valor retido" | Bruno → Recusar |
| **Critério:** sem segunda complementar | "nao existe segunda..."; "depois de recusada, tambem nao existe segunda complementar" | O botão some depois da primeira |
| **Critério:** métrica atualizada | idem | idem |
| Extra: o que acontece com o serviço | "cancelado o servico, o complementar volta inteiro ao contratante"; "concluido o servico sem resposta, a proposta deixa de valer" | — |

## US22 — Extrato do prestador

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Extrato com filtro por período | "o filtro por periodo traz so os repasses daquele periodo"; "periodo invertido ou data em outro formato sao recusados" | Rita → **Extrato** → De/Até, Este mês, Últimos 30 dias, Tudo |
| Bruto, taxa e líquido por serviço | "o extrato traz bruto, taxa e liquido por servico (o complementar soma na linha do servico)"; "em cada linha, bruto - taxa = liquido"; "multa de cancelamento e disputa dividida entram sem taxa" | Tabela **Recebidos** |
| Totais e retidos | "a soma confere: os totais sao a soma das linhas"; "os valores retidos aparecem separados e fora dos totais" | Três quadros de total + **Ainda congelados** |
| Exportar | "exporta o extrato em CSV, com as linhas, o total e os retidos" | Botão **Exportar CSV** (abre no Excel) |
| **Critério:** a soma confere | idem | Linha "Total" = quadros do topo |
| **Critério:** retidos separados | idem | idem |
| **Critério:** filtro correto | idem; "cada prestador ve so o proprio extrato"; "o extrato e so do prestador" | — |

---

## Para mostrar que os testes pegam erro

Antes da entrega, três regras foram desligadas uma de cada vez e os testes correspondentes falharam: o limite de 50% (5 falhas), o prazo de 72 horas da disputa (2) e o bloqueio da confirmação automática durante a disputa (7).
