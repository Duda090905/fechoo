# Checklist do Sprint 3

Cada linha do "O que será feito" e cada critério de aceite dos cartões US06, US11, US17 e US18, com o teste automático que prova e o lugar para ver na tela.

**Antes de começar**

1. `cd backend && npm run teste` → esperado: **242 critérios, 0 falhas**.
2. `npm run db:demo -- --recriar` (datas a partir de hoje) e `npm run dev`; no front, `npm run dev`.
3. Contas de demonstração, todas com a senha `demo1234`:

| Conta | Para conferir |
| --- | --- |
| `ana.demo@fecho.app` | aceitar e pagar o orçamento do Eli ("Instalar duas tomadas"), compromisso de amanhã já pago |
| `eli.demo@fecho.app` | ver o aviso de pagamento garantido e o endereço; cadastrar a chave Pix ao vivo (US06) |
| `rita.demo@fecho.app` | prestadora já verificada (selo); endereço liberado no compromisso de amanhã |
| `joao.demo@fecho.app` | sem selo, para comparar na busca |

O `db:demo` imprime o CPF do Eli (chave certa) e o da Ana (chave errada).

---

## US06 — Verificação de identidade e selo (chave Pix) · 3 pontos

| Item do card | Teste (`npm run teste`) | Na tela |
| --- | --- | --- |
| Cadastro da chave Pix no painel do prestador | "depois de recusado, o prestador cadastra de novo e a chave no proprio CPF e aceita" | Eli → Meu perfil → Receber pelo Pix |
| Conferir o titular da chave contra o CPF do cadastro | "chave Pix cujo titular nao e o CPF do cadastro e recusada" | Digite o CPF da Ana: aparece a recusa em vermelho |
| Selo na busca e no perfil quando bate | "o selo so aparece depois da conferencia aprovada" | Digite o CPF do Eli → selo no perfil; Profissionais → Eletricista: Eli com selo |
| Nenhuma imagem de documento | "imagem de documento nao e recebida nem armazenada" | Não existe campo de arquivo na tela |
| **Critério:** chave de outro titular é recusada | idem | idem |
| **Critério:** selo só depois da conferência | "antes da conferencia ... sem o selo" + "o selo so aparece depois" | Compare Eli antes e depois na busca |
| **Critério:** nenhuma imagem armazenada | "nada novo no disco" | — |
| **Critério:** recusado recebe o motivo e pode cadastrar outra | "o prestador recusado recebe o motivo em linguagem simples" | A mensagem diz o porquê; o campo continua aberto |

## US17 — Pagamento retido via Pix

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Asaas em sandbox | (manual: `PAGAMENTO_GATEWAY=asaas`; ver README) | O console da API mostra `[pagamento] gateway: asaas` |
| Cobrança Pix com identificador único ligado ao serviço | "o identificador da cobranca corresponde ao servico correto" | — (tabela `pagamentos`, coluna `identificador` = `fecho-s<id>-...`) |
| Tela com QR code, copia e cola e prazo | "o aceite gera a cobranca Pix com copia e cola" | Ana → serviço "Instalar duas tomadas" → Aceitar e pagar com Pix → endereço → Gerar o Pix |
| Tabela Pagamentos com Aguardando, Retido, Liberado, Estornado | modelo `Pagamento` | — |
| **Critério:** QR com exatamente o valor do orçamento | "o Pix e gerado com exatamente o valor do orcamento aceito" | Tela mostra R$ 200,00 = 180 + 20 de deslocamento |
| **Critério:** sem confirmação, status Aguardando | "enquanto o pagamento nao e confirmado, o status permanece Aguardando" | Status continua "Orçamento enviado"; lista mostra "Pix esperando pagamento" |
| **Critério:** cobrança expirada (texto revisado) | "cobranca expirada devolve o servico ao status anterior" + "pode aceitar de novo" | Para ver ao vivo: `PIX_EXPIRA_MINUTOS=1` no `.env`, gerar o Pix e esperar 1 minuto |
| **Critério:** identificador corresponde ao serviço | "o identificador da cobranca corresponde ao servico correto" | — |

## US18 — Confirmação automática do pagamento (webhook)

| Item do card | Teste | Na tela / terminal |
| --- | --- | --- |
| `POST /api/pagamentos/webhook` | todos da seção US18 | `npm run pix:pagar -- <id>` |
| Validar o token e tratar repetição (idempotência) | "requisicao sem token ou com token invalido ... 401" e "webhook enviado duas vezes nao duplica" | `npm run pix:pagar -- <id> --token-errado` (401) e `--repetir` (2º volta `duplicado`) |
| Pagamento para Retido e serviço para Aceito (texto revisado) | "webhook valido altera o status do pagamento para Retido" + "o servico passa para Aceito" | A tela da Ana muda sozinha para "Pagamento confirmado" e "Aceito" |
| Notificação para as duas partes | "o prestador recebe o aviso" + "o contratante tambem e avisado" | Eli → Meus serviços: aviso "Pagamento garantido"; e-mail no console da API |
| **Critério:** webhook válido → Retido | idem | idem |
| **Critério:** duas vezes não duplica | idem | `--repetir` |
| **Critério:** token inválido → 401 | idem | `--token-errado` |
| **Critério:** prestador recebe o aviso | idem | Aviso no topo de Meus serviços do Eli |

## US11 — Aceite do orçamento e liberação do endereço

| Item do card | Teste | Na tela |
| --- | --- | --- |
| Endpoint de aceite (com endereço) | "so o contratante aceita", "aceitar exige o endereco" | Botão amarelo Aceitar e pagar com Pix |
| Endereço só do Aceito em diante | "antes do aceite, a consulta ao servico nao traz o endereco" | Eli abre o pedido antes de pagar: cadeado "O endereço completo aparece aqui quando..." |
| Log de acesso ao endereço | "o acesso ao endereco fica registrado em log" | MySQL: `SELECT * FROM acessos_endereco ORDER BY id DESC;` |
| Notificar o prestador sobre o aceite | "o prestador recebe o aviso de pagamento garantido" | Aviso do Eli |
| **Critério:** antes do aceite, sem endereço | idem | idem |
| **Critério:** após o aceite, endereço completo | "apos o aceite, o prestador visualiza o endereco completo" | Eli abre o pedido depois do Pix: rua e número em negrito |
| **Critério:** acesso registrado em log | idem | SQL acima |

---

## Além dos cards (para o grupo decidir se fica)

- **US04 (commit separado):** serviço aceito ou pagamento Retido bloqueia desativar e apagar a conta. Teste: "quem tem pagamento congelado nao consegue desativar a conta".
- Recusar o orçamento com Pix em aberto cancela o Pix (sem isso, daria para pagar um pedido recusado).
- Pix pago depois do prazo vale e cancela o Pix novo do mesmo serviço (evita cobrar duas vezes).

## Ainda simulado no `db:demo`

Nota média (US24) e conclusão do serviço (US20). Os compromissos já pagos do demo estão gravados direto no banco no estado em que o fluxo real os deixaria.
