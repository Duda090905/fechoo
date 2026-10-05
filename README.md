# Fechô — Sprint 1

Plataforma de contratação de serviços com pagamento retido. Este repositório cobre o **Sprint 1: identidade, perfil e listagem** — 25 pontos.

| Nº | História | Nota |
|---|---|---|
| US01 | Cadastro de usuário | 3 |
| US02 | Login e acesso restrito | 3 |
| US03 | Recuperação de senha | 3 |
| US04 | Exclusão de conta e dados | 5 |
| US05 | Perfil do prestador | 8 |
| US07 | Pausar perfil | 1 |
| US08 | Filtro de atendimento entre mulheres | 2 |

Junto foi construída uma **listagem simples de prestadores**, sem a qual as US05, US07 e US08 não teriam como ser demonstradas. Ela só mostra quem tem perfil completo e está ativo, e tem apenas o filtro "apenas mulheres"; a busca por categoria e bairro é a US09, do próximo sprint.

---

## Como rodar

Precisa de Node 18 ou superior e MySQL 8.

### 1. Banco

```sql
CREATE DATABASE fecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

As tabelas são criadas pela própria aplicação ao iniciar. O arquivo `backend/schema.sql` existe como referência do modelo, caso prefira criar na mão.

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

Sobe a API em um banco em memória e verifica os critérios de aceite do sprint, história por história. Não precisa do MySQL rodando. É o jeito mais rápido de demonstrar o sprint na apresentação.

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
| GET | `/api/prestadores` | US05, US07, US08 (listagem simples) | não |

---

## Front-end

A home é enxuta e só fala do que o sistema faz neste sprint: capa com os dois caminhos (contratar ou oferecer serviço), as categorias vindas da API e um resumo para cada público. Pagamento retido, orçamento e avaliação entram na home quando forem entregues.

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

**Registro dos pedidos para sair (US04).** Cada pedido de desativação ou de exclusão dos dados grava data, origem (hoje só o painel do usuário) e resultado (concluído ou recusado por pendência) na tabela `solicitacoes_exclusao`. O registro guarda só o id do usuário, então continua existindo depois que a conta é anonimizada.

**Histórico de pausas (US07).** Cada pausa do perfil vira um período (início e fim) na tabela `pausas`. É o que permitirá descontar o tempo pausado do tempo de resposta quando existirem as solicitações de serviço.

**Telefone.** Obrigatório no cadastro, com DDD, guardado só com os dígitos.

**Foto de perfil (US05).** Enviada como arquivo (JPG, PNG ou WebP, até 2 MB), conferido pelo conteúdo. Fica em `backend/uploads/perfis`, fora do Git; em produção o certo é um armazenamento externo, e a troca mexe só em `src/servicos/armazenamento.js`.

**Filtro entre mulheres (US08).** O campo de sexo é opcional no cadastro. A opção "atendo apenas mulheres" é da prestadora, nunca vem marcada por padrão, e o back-end recusa quem não se identificou como mulher. Quem não informou o sexo simplesmente não aparece quando o filtro está ligado. A finalidade é a segurança pessoal de quem recebe alguém em casa, não segmentação comercial.

**Cores.** Azul-noite `#14243D` como base, amarelo `#FFC93C` apenas na ação principal de cada tela. Amarelo com texto azul-noite passa no contraste mínimo da WCAG; amarelo como cor de texto, não. Verde e vermelho ficam reservados para dinheiro e problema, e não decoram nada.

---

## Pendências conhecidas

1. **As 17 categorias em `backend/src/database/seed.js` são uma proposta.** Trocar pelos nomes exatos definidos no escopo do grupo e rodar `npm run db:seed` de novo.
2. **A lista de bairros** tem 25 bairros de Campinas, também para substituir pela lista oficial de vocês.
3. **Prazo de retenção da conta inativa.** Hoje ela fica guardada para sempre. O cliente definiu um prazo; falta registrar o valor aqui e implementar o que acontece quando ele vence.
4. **Fotos em disco.** Servem para desenvolvimento e apresentação; em hospedagem real, usar armazenamento externo.5. **Migrations.** O projeto usa `sequelize.sync()`, que resolve em desenvolvimento. Para produção o certo é migração versionada.
