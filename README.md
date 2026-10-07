# Fechô — Sprint 2

Plataforma de contratação de serviços com pagamento retido. Este repositório cobre o **Sprint 1** (identidade, perfil e listagem, 25 pontos) e o **Sprint 2** (encontrar e combinar o serviço).

### Sprint 2

| Nº | História | Origem |
|---|---|---|
| US09 | Busca por categoria e bairro | backlog |
| US10 | Solicitação de serviço e orçamento | backlog |
| US12 | Chat interno do serviço | backlog |
| US13 | Agendamento de data e hora | backlog |
| US26 | Alterar a senha estando logado | curinga CC06 |

Os cards coringa ganham o próximo número do backlog quando entram numa sprint: o CC06 virou a US26.

**O que depende das próximas histórias.** O aceite do orçamento é a US11; por isso a agenda (US13) só mostra o compromisso depois de um aceite que ainda não existe na tela. A nota média e o selo do cartão da busca (US09) já são lidos do banco e ordenam o resultado, mas quem os preenche são a US24 (avaliações) e a US06 (verificação). Os testes automáticos simulam essas etapas direto no banco para provar os critérios.

### Sprint 1

| Nº | História | Nota |
|---|---|---|
| US01 | Cadastro de usuário | 3 |
| US02 | Login e acesso restrito | 3 |
| US03 | Recuperação de senha | 3 |
| US04 | Exclusão de conta e dados | 5 |
| US05 | Perfil do prestador | 8 |
| US07 | Pausar perfil | 1 |
| US08 | Filtro de atendimento entre mulheres | 2 |

---

## Como rodar

Precisa de Node 18 ou superior e MySQL 8.

### 1. Banco

```sql
CREATE DATABASE fecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

As tabelas são criadas pela própria aplicação ao iniciar. O arquivo `backend/schema.sql` existe como referência do modelo, caso prefira criar na mão.

**Banco que já existia no Sprint 1:** as tabelas novas (`servicos` e `mensagens`) são criadas sozinhas, mas as colunas e os índices novos precisam do SQL que está em `ALTERACOES.md`, seção *Sprint 2 > Banco de dados*.

### 2. API

```bash
cd backend
npm install
cp .env.example .env     # preencha DB_USER e DB_PASS
npm run db:seed          # carrega áreas, categorias e bairros
npm run dev              # http://localhost:3333
```

### 3. Front

```bash
cd frontend
npm install
cp .env.example .env
npm run dev              # http://localhost:5173
```

### 4. Teste automatizado

```bash
cd backend
npm run teste
```

Sobe a API em um banco em memória e verifica os critérios de aceite dos dois sprints, história por história (192 verificações). Não precisa do MySQL rodando. É o jeito mais rápido de demonstrar o sprint na apresentação.

---

## Endpoints

| Método | Rota | História | Protegida |
|---|---|---|---|
| POST | `/api/auth/register` | US01 | não |
| POST | `/api/auth/login` | US02 | não |
| POST | `/api/auth/esqueci-senha` | US03 | não |
| POST | `/api/auth/redefinir-senha` | US03 | não |
| GET | `/api/conta` | US02 | sim |
| GET | `/api/conta/pendencias` | US04 | sim |
| DELETE | `/api/conta` | US04 (desativar) | sim |
| POST | `/api/conta/reativar` | US04 (voltar) | sim |
| DELETE | `/api/conta/definitiva` | US04 (LGPD) | sim |
| GET | `/api/catalogo/areas` | US05 | não |
| GET | `/api/catalogo/bairros` | US05 | não |
| GET | `/api/prestadores/meu-perfil` | US05 | sim (prestador) |
| PUT | `/api/prestadores/meu-perfil` | US05, US08 | sim (prestador) |
| PUT | `/api/prestadores/foto` | US05 (enviar foto) | sim (prestador) |
| DELETE | `/api/prestadores/foto` | US05 (remover foto) | sim (prestador) |
| PATCH | `/api/prestadores/pausa` | US07 | sim (prestador) |
| PUT | `/api/conta/senha` | US26 (trocar a senha logado) | sim |
| GET | `/api/prestadores?categoria=&bairro=&somente_mulheres=` | US09 (busca), US07, US08 | não |
| POST | `/api/servicos` | US10, US13 (pedido com fotos, data e hora) | sim (contratante) |
| GET | `/api/servicos` | US10 (meus pedidos e pendências do prestador) | sim |
| GET | `/api/servicos/agenda` | US13 (compromissos depois do aceite) | sim |
| GET | `/api/servicos/:id` | US10, US02 (só as duas partes) | sim |
| POST | `/api/servicos/:id/orcamento` | US10, US13 (valor, prazo, horário, deslocamento) | sim (prestador) |
| POST | `/api/servicos/:id/recusar` | US10 (recusar e encerrar) | sim (contratante) |
| GET | `/api/servicos/:id/arquivos/:nome` | US10, US12 (fotos e imagens, só as partes) | sim |
| GET | `/api/servicos/:id/mensagens?depois=` | US12 | sim |
| POST | `/api/servicos/:id/mensagens` | US12 (texto e imagem) | sim |

---

## Front-end

Telas do Sprint 2: **Profissionais** (a busca, escrita como uma frase: "Preciso de [serviço] no bairro [bairro]"), o painel **Pedir orçamento** que abre por cima da busca, **Meus serviços** (abas Pedidos e Agenda) e a página de cada serviço, com o pedido, o orçamento em forma de comprovante e a conversa. A troca de senha fica em **Minha conta**.

A home é enxuta e só fala do que o sistema faz: capa com os dois caminhos (contratar ou oferecer serviço), as categorias vindas da API e um resumo para cada público. Pagamento retido, orçamento e avaliação entram na home quando forem entregues.

As telas de conta (entrar, criar conta, recuperar senha) usam layout de duas colunas no desktop, com uma lateral escura que resume o que a plataforma oferece; no celular a lateral some e sobra só o formulário.

Os ícones são SVG escritos à mão em `componentes/Icones.jsx` — o projeto não ganha dependência só por causa de desenho. Toda a paleta e o espaçamento vivem em `estilos/tokens.css`.

## Decisões técnicas

**Senha.** Hash com bcrypt, nunca gravada em texto puro. Mínimo de 8 caracteres com letra e número.

**Sessão.** Token JWT com validade de 8 horas. O middleware confere o token e o status do usuário em toda rota protegida — conta excluída perde o acesso mesmo com token válido. Ao redefinir a senha, as sessões abertas antes são encerradas.

**Login.** A mensagem de erro é sempre a mesma, para não revelar se o e-mail existe.

**Recuperação de senha.** O token vai por e-mail em texto puro, mas no banco fica apenas o hash SHA-256. Vale 30 minutos e só pode ser usado uma vez; ao ser usado, todos os outros links pendentes daquela conta são invalidados. Sem SMTP configurado, o link aparece no console do servidor — funciona para desenvolver e para demonstrar sem internet.

**Saída da conta (US04), em dois níveis.**

*Desativar* é o caminho normal e não apaga nada. A conta vira `inativo`: sai das buscas e perde o acesso, mas cadastro e histórico continuam guardados. Para voltar, basta entrar e reativar — tudo volta como estava.

*Apagar os dados* é o direito da LGPD, disponível só depois de a conta estar inativa. Nome, e-mail, CPF, telefone, senha e a foto de perfil (inclusive o arquivo no disco) são apagados.

Os dois caminhos são bloqueados enquanto houver pendência em aberto.
**Pendências.** A regra de bloqueio mora em `src/servicos/pendencias.js`. Cada módulo que cria compromisso entre duas pessoas registra o seu verificador ali; o controller de conta não precisa ser alterado. No Sprint 1 não há nenhum registrado, porque Serviços e Disputas só existem a partir do Sprint 2 — o arquivo traz comentado o formato exato do verificador que o módulo de serviços vai registrar. O teste automatizado registra um verificador falso para provar que o bloqueio funciona.

**Conta inativa e acesso.** O login de uma conta inativa funciona de propósito: é o único jeito de a pessoa se reativar. O middleware `exigirAtivo` barra todas as demais rotas, então uma conta inativa não mexe no perfil e não aparece em listagem.

**Cadastro com CPF já usado.** A mensagem é sempre a mesma, seja a conta ativa ou inativa: *"Já existe uma conta com esse e-mail ou CPF. Entre com sua senha ou recupere o acesso."* Confirmar para um estranho que determinado CPF tem conta desativada seria vazamento de dado pessoal.

**Retenção de conta inativa (US04).** Quem desativa a conta tem os dados guardados por 12 meses. Depois disso os dados pessoais são anonimizados, do mesmo jeito que no botão *Apagar meus dados*. Uma rotina (`src/servicos/retencao.js`) roda ao iniciar a API e uma vez por dia:

- entrar na conta zera o relógio e cancela o aviso (a contagem parte do mais recente entre a desativação e o último acesso);
- 30 dias antes do vencimento a pessoa recebe um e-mail de aviso (sem SMTP configurado, ele aparece no console). Se a rotina atrasar e o aviso sair tarde, a exclusão espera completar os 30 dias;
- conta com pendência (serviço em andamento, valor retido) nunca é anonimizada;
- cada exclusão automática fica registrada em `solicitacoes_exclusao` com origem `rotina_automatica`;
- prazo e aviso podem ser mudados no `.env` com `RETENCAO_MESES` e `RETENCAO_AVISO_DIAS`.

A anonimização mantém o registro da conta (para o que a lei exige guardar, como registros financeiros) sem identificar a pessoa.

**Registro dos pedidos para sair (US04).** Cada pedido de desativação ou de exclusão dos dados grava data, origem (hoje só o painel do usuário) e resultado (concluído ou recusado por pendência) na tabela `solicitacoes_exclusao`. O registro guarda só o id do usuário, então continua existindo depois que a conta é anonimizada.

**Histórico de pausas (US07).** Cada pausa do perfil vira um período (início e fim) na tabela `pausas`. É o que permitirá descontar o tempo pausado do tempo de resposta quando existirem as solicitações de serviço.

**Telefone.** Obrigatório no cadastro, com DDD, guardado só com os dígitos.

**Foto de perfil (US05).** Enviada como arquivo (JPG, PNG ou WebP, até 2 MB), conferido pelo conteúdo. Fica em `backend/uploads/perfis`, fora do Git; em produção o certo é um armazenamento externo, e a troca mexe só em `src/servicos/armazenamento.js`.

**Filtro entre mulheres (US08).** O campo de sexo é opcional no cadastro. A opção "atendo apenas mulheres" é da prestadora, nunca vem marcada por padrão, e o back-end recusa quem não se identificou como mulher. Quem não informou o sexo simplesmente não aparece quando o filtro está ligado. A finalidade é a segurança pessoal de quem recebe alguém em casa, não segmentação comercial.

**Busca (US09).** Filtros opcionais de categoria e bairro, somados ao filtro entre mulheres. Só aparece prestador ativo, com conta ativa e com categoria e bairro. A ordem é: avaliação média (quem não tem nota vai para o fim), depois serviços concluídos (status confirmado ou pago), depois ordem de cadastro. Os campos de filtro têm índice (`idx_prestador_categorias_categoria`, `idx_prestador_bairros_bairro`, `idx_prestadores_status`).

**Pedido e orçamento (US10).** Os status seguem os nomes do cartão: `aguardando_orcamento`, `orcamento_enviado` e `recusado`. A coluna já tem os demais estados da máquina de estados, para as próximas histórias. O prazo do orçamento é a duração estimada em horas (1 a 24). Taxa de deslocamento só quando o bairro do pedido está fora dos bairros do prestador (pode ser zero); dentro da área, é recusada. Quem atende apenas mulheres (US08) não recebe pedido de quem não se identificou como mulher.

**Fotos do pedido e imagens do chat (US10, US12).** Até 3 fotos por pedido e 1 imagem por mensagem, JPG, PNG ou WebP de até 2 MB, conferidas pelo conteúdo. A localização gravada pelo celular (EXIF/XMP) é apagada antes de salvar, porque revelaria o endereço do contratante antes do aceite. Os arquivos ficam em `uploads/servicos`, que não é pasta pública: só as duas partes abrem, pela rota com login.

**Agenda (US13).** Data e hora no pedido e na proposta; data no passado é recusada. Um horário fica ocupado pelo orçamento enviado e pelo compromisso aceito, do início até o fim do prazo. O compromisso aparece na agenda dos dois lados depois do aceite. Uma rotina de hora em hora manda o lembrete da véspera às duas partes (sem SMTP, aparece no console).

**Chat (US12).** Só as duas partes abrem; para qualquer outra pessoa a resposta é 404, sem revelar que o serviço existe. Não existe edição nem exclusão de mensagem. O chat para de receber mensagens quando o serviço é concluído ou encerrado (recusado, cancelado, expirado), e as mensagens continuam disponíveis para consulta. O front busca as novas a cada 3 segundos.

**Prazo de guarda das mídias (US12).** Imagens do chat e fotos do pedido ficam 90 dias depois do encerramento do serviço (`MIDIAS_RETENCAO_DIAS`). O prazo cobre a disputa (aberta em até 72 horas e decidida em até 7 dias) e o pedido de devolução de um Pix (MED), que pode ser feito em até 80 dias. Depois disso os arquivos saem do disco; o texto das mensagens fica.

**Trocar a senha (US26).** Exige a senha atual e aplica a mesma regra do cadastro; a nova não pode ser igual à atual. Sobe o `token_versao`, o que encerra as outras sessões, e devolve um token novo para a sessão que fez a troca.

**Cores.** Azul-noite `#14243D` como base, amarelo `#FFC93C` apenas na ação principal de cada tela. Amarelo com texto azul-noite passa no contraste mínimo da WCAG; amarelo como cor de texto, não. Verde e vermelho ficam reservados para dinheiro e problema, e não decoram nada.

---

## Pendências conhecidas

1. **As 17 categorias em `backend/src/database/seed.js` são uma proposta.** Trocar pelos nomes exatos definidos no escopo do grupo e rodar `npm run db:seed` de novo.
2. **A lista de bairros** tem 25 bairros de Campinas, também para substituir pela lista oficial de vocês.
3. **Retenção de conta inativa.** Implementada com 12 meses e aviso 30 dias antes (recomendação do grupo). Confirmar o prazo com o cliente e escrevê-lo nos termos de uso.
4. **Fotos em disco.** Servem para desenvolvimento e apresentação; em hospedagem real, usar armazenamento externo.
5. **Migrations.** O projeto usa `sequelize.sync()`, que resolve em desenvolvimento. Para produção o certo é migração versionada.
6. **Aceite, avaliações e verificação.** A agenda depende do aceite (US11), e a nota média e o selo da busca dependem da US24 e da US06.
7. **Prazo de guarda das mídias do chat (90 dias).** Proposta técnica a confirmar pelo grupo.
