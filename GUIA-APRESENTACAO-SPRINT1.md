# Fechô — Sprint 1: guia de apresentação ao cliente

Este guia é para o grupo usar **antes e durante** a reunião de entrega. Ele diz o que mostrar, em que ordem,
o que falar, quais critérios de aceite cada demonstração prova e o que deve ser declarado com transparência.

- **Duração sugerida:** 20 a 25 minutos (15 de demonstração, 5 a 10 de conversa).
- **Histórias entregues (25 pontos):** US01, US02, US03, US04, US05, US07 e US08.
- **Branch:** `Alterações-(correções-sprint-1)`. O que mudou e por quê está em `ALTERACOES.md`; decisões técnicas e endpoints, na `README.md`.

| Card | História | Pontos |
|---|---|---|
| US01 | Cadastro de usuário | 3 |
| US02 | Login e acesso restrito | 3 |
| US03 | Recuperação de senha | 3 |
| US04 | Exclusão de conta e dados | 5 |
| US05 | Perfil do prestador | 8 |
| US07 | Pausar perfil | 1 |
| US08 | Filtro de atendimento entre mulheres | 2 |

---

## 1. A mensagem principal (30 segundos de abertura)

> "Neste sprint entregamos a base de identidade e confiança do Fechô: quem pode entrar, como recupera o acesso,
> como o prestador monta o perfil e como qualquer pessoa sai da plataforma levando seus dados junto, conforme a LGPD.
> Tudo o que está na tela foi verificado por testes automatizados, e vamos mostrar isso ao vivo no final."

Pontos que o cliente deve levar da reunião:
1. **Segurança desde o início:** senha com hash, sessão que expira, link de recuperação de uso único, acesso restrito por perfil.
2. **LGPD levada a sério:** consentimento no cadastro, exclusão com anonimização e prazo de retenção da conta inativa.
3. **Segurança pessoal:** o filtro "apenas mulheres" existe para quem recebe alguém em casa.
4. **O escopo está fechado:** entregamos exatamente os sete cards combinados, sem funcionalidades a mais.

---

## 2. Antes da reunião: preparação (faça 1 hora antes)

### 2.1 Ambiente

- [ ] **MySQL no ar** (neste ambiente ele roda como processo, não como serviço, e não sobe sozinho depois de reiniciar o PC):
  ```powershell
  Start-Process "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" -ArgumentList '--datadir="C:\Users\Usuario\mysql-fecho\data"','--bind-address=127.0.0.1' -WindowStyle Hidden
  ```
  Em outro computador, use o MySQL que o grupo tiver instalado e crie o banco `fecho` (ver `README.md`).
- [ ] **Backend:** `cd backend` e `npm run dev` → deve aparecer *"API do Fecho rodando em http://localhost:3333"*.
- [ ] **Frontend:** `cd frontend` e `npm run dev` → abrir `http://localhost:5173`.
  Atenção: rodar **só** `npm run dev`, sem comentário depois do comando.
- [ ] **Categorias e bairros carregados:** `cd backend` e `npm run db:seed`. A home deve listar as categorias.
- [ ] **Banco novo de colunas:** se o banco foi criado antes das últimas mudanças, aplicar os `ALTER TABLE` do `ALTERACOES.md`
  (ou recriar o banco e rodar o seed).

### 2.2 Dados e materiais

- [ ] Uma **foto de perfil** pronta (JPG, PNG ou WebP, até 2 MB) numa pasta fácil de achar.
- [ ] **CPFs de teste válidos** (o sistema valida os dígitos, então CPF inventado é recusado):

  | Uso | CPF |
  |---|---|
  | Contratante | `529.982.247-25` |
  | Prestadora | `111.444.777-35` |
  | Prestador (homem) | `153.509.460-56` |
  | Reserva 1 | `390.533.447-05` |
  | Reserva 2 | `862.883.667-57` |
  | Reserva 3 | `168.995.350-09` |

  Se aparecer "já existe uma conta com esse e-mail ou CPF", use outro da lista ou outro e-mail.
- [ ] **E-mails de demonstração:** use um padrão fácil, por exemplo `contratante@demo.com`, `prestadora@demo.com`, `prestador@demo.com`.
  Senha de todas: `senha1234` (mínimo 8 caracteres, com letra e número).
- [ ] **Terminal do backend visível** (janela ao lado ou aba separada): o link de recuperação de senha aparece lá.
  Se o grupo configurar um SMTP de teste (por exemplo Mailtrap) no `.env`, o e-mail chega de verdade.
- [ ] **Segundo navegador ou janela anônima**, para mostrar dois usuários ao mesmo tempo.
- [ ] (Opcional) **MySQL Workbench** conectado em `127.0.0.1`, usuário `root`, banco `fecho`, para mostrar os dados gravados.
- [ ] **Rodar `npm run teste` uma vez antes**, em `backend`. Deve terminar com *"107 criterios passaram, 0 falharam."*.

### 2.3 Começar do zero (recomendado)

Para a demonstração partir de um banco limpo, apague só as contas de demonstração. Rode no MySQL, ajustando o domínio se usar outro:

```sql
-- apaga somente contas de demonstração (e-mail terminado em @demo.com) e o que depende delas
DELETE FROM solicitacoes_exclusao WHERE usuario_id IN (SELECT id FROM (SELECT id FROM usuarios WHERE email LIKE '%@demo.com') x);
DELETE FROM pausas WHERE prestador_id IN (SELECT id FROM (SELECT id FROM prestadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.com')) y);
DELETE FROM prestador_categorias WHERE prestador_id IN (SELECT id FROM (SELECT id FROM prestadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.com')) y);
DELETE FROM prestador_bairros WHERE prestador_id IN (SELECT id FROM (SELECT id FROM prestadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.com')) y);
DELETE FROM prestadores WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.com');
DELETE FROM tokens_senha WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.com');
DELETE FROM usuarios WHERE email LIKE '%@demo.com';
```

Contas que já passaram pelo "Apagar meus dados" perdem o e-mail e não entram nessa limpeza; o CPF delas fica livre mesmo assim.
As fotos enviadas ficam em `backend/uploads/perfis`; podem ficar lá.

---

## 3. Roteiro da demonstração

**Ordem sugerida:** US01 → US02 → US03 → US05 → US07 → US08 → US04.
A exclusão fica por último porque é a única demonstração que encerra a conta usada.

> Sugestão de divisão: uma pessoa fala e conduz a tela, outra segura o terminal do backend e o Workbench.

### 3.1 Abertura: a home (1 min)

- Abrir `http://localhost:5173`.
- **Mostrar:** a capa, as categorias vindas da API e os dois caminhos ("Preciso de um serviço" e "Quero oferecer meu trabalho").
- **Dizer:** "A home é simples de propósito: só apresenta o que existe neste sprint. Pagamento retido, orçamento e avaliação entram quando forem entregues."

### 3.2 US01: Cadastro (3 min)

**Passo a passo**
1. Clicar em **Criar conta**.
2. Digitar um CPF errado (`111.111.111-11`) e sair do campo → aparece **"Esse CPF não é válido."** antes de qualquer envio.
3. Digitar o CPF correto: a máscara `000.000.000-00` aparece sozinha. O telefone também ganha máscara e é obrigatório.
4. Tentar enviar **sem marcar o aceite dos termos** → recusado.
5. Preencher tudo como **prestadora** (sexo: Feminino) e criar a conta.
6. Em uma janela anônima, criar também um **contratante**.
7. Tentar criar de novo com o mesmo e-mail ou CPF → recusado, sem criar duplicidade.

**Critérios de aceite que isso prova**
- [x] Cadastro com e-mail ou CPF já existente retorna erro e não cria duplicidade.
- [x] CPF inválido é recusado antes do envio.
- [x] Sem o aceite do termo, o cadastro não é concluído.
- [x] A senha é gravada apenas como hash.

**Prova do hash (opcional, no Workbench):**
`SELECT email, senha_hash FROM usuarios;` → a coluna começa com `$2...` (bcrypt), nunca a senha.

**Dizer:** "O sistema também trata o e-mail (maiúsculas e espaços) e exige telefone com DDD, porque o card pede nome, CPF, e-mail, telefone e senha."

### 3.3 US02: Login e acesso restrito (3 min)

**Passo a passo**
1. Sair e entrar com a conta da prestadora → vai direto para **Meu perfil**. O contratante vai para a lista de profissionais.
2. Errar a senha → mensagem **genérica** ("E-mail ou senha incorretos"), sem dizer qual campo errou.
3. Logado como **contratante**, tentar abrir `http://localhost:5173/meu-perfil` → o sistema barra: essa área é só de prestador.
4. Sem login, abrir `/minha-conta` → vai para a tela de entrar.

**Opcional, mostra a sessão encerrada (US02 + US03):**
com a prestadora logada numa janela, redefinir a senha dela em outra (ver 3.4) e voltar à primeira janela clicando em **Minha conta** →
volta ao login com o aviso *"Sua sessão terminou"*.

**Critérios de aceite**
- [x] Credenciais corretas geram token válido e levam ao painel do perfil correspondente.
- [x] Senha incorreta retorna mensagem genérica.
- [x] Token expirado devolve o usuário para a tela de login. (O backend recusa o token e o front volta ao login; este último passo só foi verificado pelo código, então **confira no navegador antes da reunião**.)
- [ ] "Usuário A não acessa serviço do usuário B": **depende de serviços (Sprint 2)**. O controle de acesso por perfil e por token já está pronto.

**Dizer:** "A sessão dura 8 horas e a validade é conferida em toda requisição protegida. Se expirar com a tela aberta, a pessoa volta ao login."

### 3.4 US03: Recuperação de senha (3 min)

**Passo a passo**
1. Na tela de entrar, clicar em **Esqueci minha senha**.
2. Pedir o link para um e-mail **que existe** e depois para um que **não existe** → a mensagem é **idêntica** nos dois casos
   (não revela se a conta existe).
3. Mostrar o **terminal do backend**: aparece `[recuperacao de senha] link: http://localhost:5173/redefinir-senha?token=...`.
   Explicar que, com SMTP configurado, isso vai por e-mail.
4. Abrir o link, definir a nova senha → "Senha alterada".
5. Abrir o **mesmo link de novo** → recusado ("expirou ou já foi usado").
6. Entrar com a senha **antiga** → não funciona; com a nova → funciona.

**Critérios de aceite**
- [x] Link expirado ou já usado não permite redefinir a senha.
- [x] E-mail não cadastrado recebe a mesma resposta genérica.
- [x] Após a redefinição, a senha antiga não funciona mais.

**Detalhes de segurança para citar**
- O link vale 30 minutos e só pode ser usado uma vez; ao usar um, os demais pendentes são invalidados.
- No banco fica só o **hash** do token, nunca o token em si (`SELECT token_hash FROM tokens_senha;` mostra 64 caracteres ilegíveis).
- Trocar a senha **encerra as sessões abertas**.

### 3.5 US05: Perfil do prestador (4 min)

**Passo a passo**
1. Logar como a prestadora → **Meu perfil** (abre em modo de edição).
2. **Escolher foto**: selecionar uma imagem; a **prévia aparece na hora**.
3. Escrever a descrição.
4. Selecionar categorias: ao chegar em **5**, as demais ficam bloqueadas ("sexta categoria" impossível).
5. Selecionar alguns bairros.
6. **Salvar alterações** → o perfil aparece com foto, descrição, categorias e bairros.
7. Abrir **Profissionais** como contratante: o cartão da prestadora aparece com foto e categorias.
8. (Prova de "sem categoria/bairro não aparece") criar uma terceira conta de prestador **sem montar o perfil** e mostrar que ela **não aparece** na lista.
9. Voltar a **Meu perfil**, trocar a foto ou uma categoria, salvar e atualizar **Profissionais**: a alteração **já está lá**.

**Critérios de aceite**
- [x] O sistema impede selecionar a sexta categoria.
- [x] Prestador sem categoria ou sem bairro não aparece em nenhuma busca.
- [x] Alteração no perfil reflete imediatamente no resultado da busca.

**Detalhes de segurança da foto**
- Aceita JPG, PNG e WebP até 2 MB. O formato é conferido pelo **conteúdo** do arquivo, não pelo nome; **SVG é recusado** (pode carregar script).
- Ao trocar ou remover a foto, o arquivo antigo é **apagado do disco**.

**Declarar com transparência:** "Os nomes das categorias e os bairros são exemplos. Substituímos pela lista oficial assim que o cliente passar."

### 3.6 US07: Pausar perfil (2 min)

**Passo a passo**
1. Em **Meu perfil**, clicar em **Pausar meu perfil** → o selo muda para "Perfil pausado".
2. Atualizar **Profissionais**: a prestadora **sumiu** da lista.
3. Mostrar que o perfil, o histórico e a foto continuam guardados (voltar ao **Meu perfil**).
4. Clicar em **Voltar a aparecer** → ela reaparece, **sem refazer o cadastro**.
5. (Opcional, Workbench) `SELECT * FROM pausas;` → um período por pausa, com início e fim.

**Critérios de aceite**
- [x] Prestador pausado não aparece na busca, mas mantém histórico e avaliações.
- [x] Ao retomar, o prestador volta a aparecer sem precisar refazer o cadastro.
- [ ] "Serviços já aceitos continuam durante a pausa" e "tempo pausado não conta como demora": **dependem das solicitações de serviço (US10)**.
  O histórico de pausas já está sendo gravado para isso.

### 3.7 US08: Filtro entre mulheres (2 min)

**Passo a passo**
1. Em **Profissionais**, ligar **"Apenas mulheres"** → só aparecem prestadoras mulheres.
2. Desligar → aparecem todos.
3. Em **Meu perfil**, mostrar a opção **"Quero atender apenas mulheres"**: ela **não vem marcada** e só aparece para quem se declarou do sexo feminino.
4. Mostrar que quem **não informou o sexo** não aparece com o filtro ligado (criar uma conta com "Prefiro não informar").

**Critérios de aceite**
- [x] Quem não informou o sexo simplesmente não aparece quando o filtro está ativo.
- [x] A opção nunca vem marcada por padrão para a prestadora.
- [x] Com o filtro desligado, a busca traz todos os prestadores normalmente.

**Dizer:** "O campo de sexo é opcional e a finalidade é a segurança pessoal de quem recebe alguém em casa, não segmentação comercial. Isso está registrado na documentação, como o card pede."

### 3.8 US04: Exclusão de conta e dados (4 min)

**Passo a passo**
1. Logar como o **contratante** → **Minha conta**.
2. Mostrar a área **"Desativar minha conta"** e o texto sobre os 12 meses.
3. Clicar em desativar, digitar `DESATIVAR` → conta desativada. Mostrar que ela perde o acesso ao resto do sistema.
4. **Reativar** → tudo volta como estava.
5. Desativar de novo e usar **Apagar meus dados**, digitando `APAGAR MEUS DADOS`.
6. No Workbench: `SELECT id, nome, email, cpf, status FROM usuarios;` → a conta aparece como **"Usuario removido"**, sem e-mail e sem CPF, status `excluido`.
7. `SELECT * FROM solicitacoes_exclusao;` → cada pedido tem **data, origem e resultado**.
8. Mostrar que o **token antigo** da conta apagada não funciona mais.

**Critérios de aceite**
- [x] Após a exclusão, o nome do usuário não aparece mais em buscas nem em perfis.
- [x] Registrar data e origem da solicitação.
- [x] Anonimizar os dados pessoais (a foto também é apagada do disco).
- [~] "Usuário com serviço em andamento recebe recusa explicando o motivo": o **mecanismo** está pronto e provado nos testes automáticos
  com um serviço simulado; o serviço real nasce no Sprint 2.
- [~] "As avaliações antigas permanecem, mas sem identificar a pessoa": a anonimização está pronta; as avaliações existem a partir da US24.

**Retenção de conta inativa (pedido do cliente)**
- Quem desativa a conta tem os dados guardados por **12 meses**; depois, os dados pessoais são **anonimizados**.
- A pessoa recebe **e-mail 30 dias antes**; **entrar na conta zera o relógio**; conta com pendência **nunca** é anonimizada.
- Não dá para esperar 12 meses na demonstração. Mostrar a seção **"US04 - Retencao de conta inativa"** da saída de `npm run teste` (11 verificações que simulam o passar do tempo).
- **Declarar:** "O prazo de 12 meses e o comportamento de anonimizar são a nossa proposta, baseada nas boas práticas e na LGPD. Precisamos da confirmação do cliente."

### 3.9 Fechamento técnico: os testes automáticos (2 min)

No terminal, em `backend`:

```powershell
npm run teste
```

Mostrar a lista passando e a linha final: **"107 criterios passaram, 0 falharam."**
O teste sobe a API num banco temporário em memória, não mexe nos dados da demonstração e não precisa de MySQL.

| Card | Verificações automáticas |
|---|---|
| US01 Cadastro | 15 |
| US02 Login e acesso restrito | 5 |
| US03 Recuperação de senha | 12 |
| US05 Perfil do prestador (perfil, validação, foto) | 31 |
| US07 Pausar perfil | 7 |
| US08 Filtro entre mulheres | 3 |
| US04 Exclusão de conta e dados (inclui retenção) | 34 |
| **Total** | **107** |

---

## 4. Matriz dos critérios de aceite

Legenda: **[x]** demonstrável e testado agora · **[~]** mecanismo pronto, prova completa depende de outro sprint · **[ ]** não é possível ainda.

| Card | Critério de aceite | Situação | Onde mostrar |
|---|---|---|---|
| US01 | E-mail ou CPF repetido não duplica | [x] | 3.2 |
| US01 | CPF inválido recusado antes do envio | [x] | 3.2 |
| US01 | Senha gravada só como hash | [x] | 3.2 |
| US01 | Sem aceite do termo, não conclui | [x] | 3.2 |
| US02 | Credenciais corretas levam ao painel do perfil | [x] | 3.3 |
| US02 | Senha incorreta: mensagem genérica | [x] | 3.3 |
| US02 | Token expirado volta ao login | [x] | 3.3 |
| US02 | Usuário A não acessa serviço do usuário B | [~] | depende de serviços (Sprint 2) |
| US03 | Link expirado ou usado não redefine | [x] | 3.4 |
| US03 | E-mail inexistente: mesma resposta | [x] | 3.4 |
| US03 | Senha antiga deixa de funcionar | [x] | 3.4 |
| US04 | Serviço em andamento: recusa com motivo | [~] | testes automáticos; real no Sprint 2 |
| US04 | Nome não aparece mais em buscas e perfis | [x] | 3.8 |
| US04 | Avaliações antigas sem identificar a pessoa | [~] | depende da US24 |
| US05 | Impede a sexta categoria | [x] | 3.5 |
| US05 | Sem categoria ou bairro não aparece na busca | [x] | 3.5 |
| US05 | Alteração reflete na busca | [x] | 3.5 |
| US07 | Pausado não aparece, mas mantém histórico | [x] | 3.6 |
| US07 | Serviços já aceitos continuam na pausa | [~] | depende da US10 |
| US07 | Ao retomar, volta sem refazer cadastro | [x] | 3.6 |
| US08 | Sem sexo informado não aparece com o filtro | [x] | 3.7 |
| US08 | Opção nunca marcada por padrão | [x] | 3.7 |
| US08 | Filtro desligado traz todos | [x] | 3.7 |

---

## 5. Decisões técnicas que vale destacar

| Tema | O que fizemos |
|---|---|
| Senha | Hash com bcrypt; mínimo de 8 caracteres com letra e número |
| Sessão | JWT de 8 horas; trocar a senha encerra as sessões antigas |
| Recuperação | Token de uso único, 30 minutos, só o hash no banco |
| Mensagens | Login e "esqueci a senha" não revelam se a conta existe |
| Acesso | Rotas protegidas por token e por perfil (contratante ou prestador) |
| LGPD | Consentimento no cadastro; anonimização ao apagar; retenção de 12 meses para conta inativa; foto apagada do disco |
| Foto | Formato conferido pelo conteúdo; SVG recusado; limite de 2 MB |
| Pendências | Regra de bloqueio em um único lugar; o Sprint 2 só registra o verificador de serviços |
| Registro | Pedidos de exclusão e períodos de pausa ficam gravados com data |

---

## 6. O que NÃO está neste sprint (alinhar expectativa)

Para o cliente não esperar o que não foi pedido:

- **Busca por categoria e bairro, com ordenação por avaliação** (US09). A lista atual só existe para provar os cards 05, 07 e 08.
- **Verificação de identidade e selo** (US06).
- **Solicitação de serviço, orçamento, agendamento, chat, cancelamento** (US10 a US16).
- **Pagamento retido, repasse, taxa, extrato** (US17 a US22).
- **Disputa, avaliação, painel do administrador** (US23 a US25).
- **Editar dados do cadastro depois de criar a conta:** nenhum card pede, então não foi feito.

---

## 7. Pendências e limites: declare antes que perguntem

| Item | Situação | Quem resolve |
|---|---|---|
| Nomes oficiais das 17 categorias | O seed é uma proposta | Cliente |
| Lista oficial de bairros | 25 bairros de exemplo, já combinado | Cliente |
| Retenção de conta inativa: 12 meses e anonimizar | Implementado como proposta | Confirmar com o cliente |
| Texto dos termos de uso e da política de privacidade | Hoje o aceite é uma frase | Grupo e cliente |
| Envio real de e-mail | Sem SMTP configurado, o link aparece no console | Grupo, se quiser mostrar o e-mail |
| Fotos guardadas em disco | Servem para desenvolvimento e apresentação; em produção, armazenamento externo | Sprint de publicação |
| A rotina de retenção só roda com a API no ar | Em produção, usar um agendador externo | Sprint de publicação |
| Critérios que dependem de outros sprints | Listados na matriz da seção 4 | Próximos sprints |

---

## 8. Perguntas que o cliente pode fazer

**"Por que a conta desativada não some na hora?"**
Porque desativar é reversível: a pessoa volta quando quiser. O que apaga de vez é o botão "Apagar meus dados", ou a retenção de 12 meses.

**"Se a pessoa apaga os dados, o que sobra?"**
O registro da conta, sem nome, e-mail, CPF, telefone, senha e foto. É o que permite manter o que a lei exige guardar (por exemplo, registros financeiros no futuro) sem identificar ninguém.

**"Dá para alguém descobrir se um e-mail ou CPF tem conta?"**
Não pelas telas de login e de recuperação de senha, que respondem sempre igual. No cadastro, a mensagem de duplicidade é a mesma, esteja a conta ativa ou inativa.

**"E se o link de recuperação vazar?"**
Vale 30 minutos e uma vez só. O banco guarda apenas o hash, então um vazamento do banco não entrega links utilizáveis.

**"O filtro 'apenas mulheres' não é discriminatório?"**
É uma preferência de segurança de quem recebe alguém em casa, opcional, e a opção de atender só mulheres é da própria prestadora e nunca vem marcada. A finalidade está documentada.

**"Quando a pessoa pausa, o que acontece com os serviços já combinados?"**
Continuam normalmente. Isso será provado na US10, quando existirem serviços; o histórico de pausas já está pronto para descontar o tempo de resposta.

**"As fotos são seguras?"**
Só entram imagens JPG, PNG e WebP de até 2 MB, conferidas pelo conteúdo. Ao trocar, remover ou apagar a conta, o arquivo é apagado do disco.

**"Por que o telefone é obrigatório?"**
O card de cadastro lista nome, CPF, e-mail, telefone e senha. Pode ser tornado opcional com uma linha, se o cliente preferir.

---

## 9. Decisões para pedir ao cliente na reunião

1. Confirmar **retenção de 12 meses** e **anonimizar** (e não apagar tudo) para conta inativa.
2. Entregar a **lista oficial de categorias** (17 em 6 áreas) e de **bairros**.
3. Aprovar o **texto dos termos de uso** (podemos redigir uma proposta).
4. Confirmar que **telefone obrigatório** está de acordo.
5. Confirmar que **editar o cadastro** depois de criado fica para depois (nenhum card pede).
6. Validar a ordem do **Sprint 2**.

---

## 10. Plano B: se algo falhar durante a demonstração

| Problema | O que fazer |
|---|---|
| A tela não carrega | Conferir se o backend e o frontend estão rodando; reiniciar `npm run dev` em cada um |
| "Nao consegui falar com o servidor" | O backend está parado ou o MySQL não subiu; subir o MySQL (seção 2.1) e reiniciar o backend |
| "Já existe uma conta com esse e-mail ou CPF" | Usar outro e-mail ou outro CPF da lista |
| O link de recuperação não aparece | Olhar o terminal do **backend** (não o do frontend); ele aparece logo após pedir o link |
| A foto não aparece na prévia | Confirmar que o arquivo é JPG, PNG ou WebP e tem menos de 2 MB |
| Qualquer erro inesperado | Rodar `npm run teste` e mostrar os 107 critérios passando: a prova não depende da tela |

---

## 11. Checklist final (5 minutos antes)

- [ ] MySQL, backend e frontend rodando
- [ ] `npm run teste` passou (107 critérios)
- [ ] Home abre e mostra as categorias`n- [ ] Testado no navegador: a sessão encerrada volta ao login (ver 3.3) e a tela no celular
- [ ] Terminal do backend visível
- [ ] Foto de perfil pronta
- [ ] CPFs de teste e e-mails de demonstração à mão
- [ ] Banco de demonstração limpo (seção 2.3)
- [ ] Segunda janela (anônima) aberta
- [ ] Alguém responsável por cada card
- [ ] Lista de decisões para o cliente (seção 9) impressa ou aberta
