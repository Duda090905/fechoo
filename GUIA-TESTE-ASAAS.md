# Teste no Asaas sandbox (Sprint 4)

Objetivo: mostrar ao professor, no painel do próprio Asaas, que o Fechô **cobra o Pix** (US17), **transfere para o prestador** (US20) e **devolve ao cliente** (US15). Tudo no sandbox: dinheiro de mentira, sem custo.

A apresentação ao vivo continua no modo `simulado`. Este teste é feito uma vez, antes, e vira prints.

Tempo: uns 40 minutos. Terminal: o do VS Code, no Windows.

---

## 1. Criar a conta de teste

1. Abra **https://sandbox.asaas.com** e crie uma conta (é grátis).
2. Preencha os dados comerciais que ele pedir. O **nome não pode ter números nem caracteres especiais** (senão o Pix fica desabilitado). Com os dados preenchidos, a conta de teste é aprovada sozinha.

## 2. Gerar a chave da API

1. No painel do sandbox: **Integrações → Chaves de API → Gerar chave**.
2. Copie a chave (começa com `$aact_`). Ela aparece uma vez só.
3. **Não mande essa chave para ninguém, nem no chat.** Ela vai só no `.env`.

## 3. Configurar o `backend/.env`

Abra o `backend/.env` e deixe estas linhas assim (troque só a chave):

```
PAGAMENTO_GATEWAY=asaas
ASAAS_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY='$aact_cole_a_sua_chave_aqui'
```

- A chave vai **entre aspas simples**, por causa do `$` no começo.
- Confira se `ASAAS_WEBHOOK_TOKEN` tem um texto longo (32 caracteres ou mais). Se estiver vazio, invente um.
- Não precisa mexer em `ASAAS_CHAVE_PIX_TESTE`: sem ela, a transferência vai para a chave de teste do Banco Central (`cliente-a00001@pix.bcb.gov.br`), que é a que funciona no sandbox.

## 4. Subir o Fechô

Terminal 1 (back-end):
```
cd C:\Users\Duda\Fecho\fechoo\backend
npm run db:demo -- --recriar
npm run dev
```
O `db:demo` imprime o **CPF do Eli**. Anote: você vai usar no passo 6.

Terminal 2 (front-end):
```
cd C:\Users\Duda\Fecho\fechoo\frontend
npm run dev
```
Abra http://localhost:5173. Senha de todas as contas: `demo1234`.

## 5. Colocar saldo na conta de teste

Terminal 3:
```
cd C:\Users\Duda\Fecho\fechoo\backend
npm run asaas:saldo
```
Esperado: `Saldo atual da conta de teste: R$ 1000.00` (ou "confira no painel").

Por quê: a transferência e o estorno saem do saldo da conta, e um Pix que acabou de cair ainda não pode ser devolvido inteiro sem saldo extra.

## 6. Teste A: estorno (US15)

1. Entre como **ana.demo@fecho.app**. Em Meus serviços, abra **"Instalar duas tomadas novas no escritório"** (orçamento do Eli) e **aceite** (informe um endereço). Aparece o Pix.
2. Veja o número do serviço no endereço do navegador: `/servicos/NÚMERO`.
3. No terminal 3, rode **duas vezes**:
   ```
   npm run pix:pagar -- NÚMERO
   npm run pix:pagar -- NÚMERO --local
   ```
   A 1ª pede ao Asaas para marcar o Pix como pago. A 2ª entrega o aviso direto para o Fechô (sem túnel). A página da Ana passa a mostrar **Pagamento congelado**.
4. Ainda como Ana: **Cancelar serviço** → motivo → **Confirmar cancelamento**. Como faltam mais de 24 horas, volta 100%.
5. O comprovante mostra **Estornado** e o **código da devolução**.

## 7. Teste B: transferência ao prestador (US20)

1. Entre como **eli.demo@fecho.app** → Meu perfil → cadastre a chave Pix com o **CPF do Eli** (do passo 4).
2. Entre como **ana.demo@fecho.app** → Profissionais → **Eli** → Pedir orçamento: bairro Cambuí, data e hora **daqui a uns 20 minutos**.
3. Como **Eli**: abra o pedido e envie o orçamento (por exemplo, R$ 100) com a mesma data e hora.
4. Como **Ana**: aceite o orçamento. Pegue o NÚMERO do serviço e rode de novo:
   ```
   npm run pix:pagar -- NÚMERO
   npm run pix:pagar -- NÚMERO --local
   ```
5. Como **Eli**: **Iniciar serviço** → **Marcar como concluído**. (O botão Iniciar só funciona a partir de 1 hora antes do horário.)
6. Como **Ana**: **Confirmar que o serviço foi feito**.
7. Como **Eli**: o comprovante mostra **Liberado**, a taxa (8% = R$ 8,00), **Você recebeu R$ 92,00** e o **código da transferência**.

## 8. Os prints

No painel do Asaas sandbox:
- **Cobranças**: as duas cobranças Pix do Fechô (uma recebida e estornada, outra recebida).
- **Transferências** (ou **Extrato**): a transferência de R$ 92,00 para `cliente-a00001@pix.bcb.gov.br`.

No Fechô: os dois comprovantes. **O código do comprovante é o mesmo que aparece no Asaas.** Esse é o print mais forte: prova que foi o Asaas que fez.

## 9. Voltar ao modo da apresentação

No `backend/.env`, troque para `PAGAMENTO_GATEWAY=simulado` e reinicie o back-end (Ctrl+C e `npm run dev`). Rode `npm run db:demo -- --recriar` para começar a apresentação do zero.

---

## Se der erro

| O que aparece | O que fazer |
|---|---|
| `ASAAS_API_KEY vazia` ou erro de autorização | Confira a chave no `.env`, entre aspas simples, e reinicie o back-end |
| "saldo insuficiente" | Rode `npm run asaas:saldo` de novo |
| "O banco não conseguiu fazer a devolução agora" | Falta saldo: `npm run asaas:saldo` e cancele de novo (nada foi cancelado) |
| No console: `transferencia ... criada com status PENDING` | No painel do Asaas, em Transferências, abra a transferência e autorize com o token **000000** (é o token de teste do sandbox) |
| O comprovante do Eli fica em "Esperando o banco" | O Asaas recusou a transferência. Leia a linha `[repasse] falha...` no terminal do back-end e me mande. O sistema tenta de novo a cada 5 minutos |
| `pix:pagar` diz que o serviço não tem Pix esperando | O orçamento ainda não foi aceito, ou o Pix já foi pago |
