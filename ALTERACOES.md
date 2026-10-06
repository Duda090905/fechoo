# Registro de alterações

Branch: `Alterações-(correções-sprint-1)`

Este arquivo lista o que foi mudado em cada etapa, por quê, e como conferir.
A numeração dos itens segue a lista combinada na análise do Sprint 1.

| Fase | Itens | Situação |
|---|---|---|
| 1. Busca e perfil (US05) | 1, 2 e testes | Concluída |
| 2. Sessão (US02/US03) | 4, 5, 12 e testes de recuperação | Concluída |
| 3. Cadastro e perfil no front (US01/US05) | 3, 9, 6 | Concluída |
| Enxugamento do escopo | Remoção do que não é dos 7 cards | Concluída |
| 4. Prioridade média (revisada) | 7, 8, 11, `schema.sql` e home enxuta | Concluída |
| Retenção de conta inativa (US04) | 12 meses, aviso 30 dias antes | Concluída |
| 5. Endurecimento | Cancelada (era 13, 14 e teste de bloqueio de login: fora dos cards) | Cancelada |
| Um CPF, uma conta (US04) | Volta a impressão do CPF; quem apaga e volta reabre a mesma conta | Concluída |

---

## Fase 1: Busca e perfil (US05)

### Item 1. Listagem só mostra prestador com categoria e bairro

**Problema.** `GET /api/prestadores` usava `include` com `where` apenas quando havia filtro.
Sem filtro, o Sequelize faz `LEFT JOIN`, e prestador sem categoria ou sem bairro aparecia na lista.
Critério de aceite violado (US05): *"Prestador sem categoria ou sem bairro não aparece em nenhuma busca."*

**Como ficou.** `backend/src/controllers/prestadorController.js`, função `listar`.
A consulta agora tem dois passos:

1. Descobre os ids elegíveis, com `required: true` em usuário, categorias e bairros.
   Quem não tem categoria, bairro, ou está pausado, suspenso ou fora do filtro, não entra.
2. Carrega o perfil completo só desses ids.

**Efeito colateral corrigido.** Antes, ao filtrar por uma categoria, o cartão do prestador
mostrava apenas a categoria filtrada, escondendo as outras. Agora mostra todas.

### Item 2. Validação do perfil do prestador

**Problema.** Em `salvarPerfil`:
- `if (categorias.length) await setCategorias(...)` ignorava lista vazia, então não dava para remover categorias.
- Id inexistente chegava ao banco e estourava erro de chave estrangeira (erro 500, sem mensagem útil).
- Ids repetidos contavam para o limite de 5.
- A exigência de ao menos 1 categoria e 1 bairro existia só no front.

**Como ficou.** `backend/src/controllers/prestadorController.js`, função `salvarPerfil`.
Regra: campo ausente não altera nada; campo enviado substitui a lista inteira.

| Situação | Resposta |
|---|---|
| `categorias` ou `bairros` não é lista de inteiros positivos | 400 "Lista de ... invalida." |
| Lista vazia | 400 "Escolha ao menos uma categoria / um bairro." |
| Mais de 5 categorias (depois de remover repetidas) | 400 "Escolha no maximo 5 categorias." |
| Id que não existe no catálogo | 400 "Alguma das categorias / Algum dos bairros ... nao existe." |
| Falha em qualquer validação | Nada é gravado; o perfil salvo continua intacto |

Ids repetidos são unificados (`[3,3,3]` vira `[3]`).
A validação roda antes de qualquer escrita no banco.
A checagem da US08 (opção "atendo apenas mulheres") continua como estava.

Salvar só a descrição, a foto ou a opção da US08 continua funcionando sem reenviar as listas.

### Testes

`backend/testes/criterios.js`: nova seção **"US05 - Validacao do perfil"**, com 12 verificações.
Os testes foram escritos antes da correção e falhavam (13 falhas); agora passam.

- recusa esvaziar categorias e bairros
- recusa categoria e bairro inexistentes, com mensagem clara
- perfil recusado não altera o que estava salvo
- salvar o perfil aos poucos (só bairro, só categoria)
- categoria repetida conta uma vez só
- prestador sem categoria ou sem bairro fora da listagem, com e sem filtro
- filtrar por categoria não esconde as outras categorias do cartão

Resultado de `npm run teste`: **61 critérios passaram, 0 falharam** (antes: 49).

### Arquivos alterados na fase 1

- `backend/src/controllers/prestadorController.js`
- `backend/testes/criterios.js`
- `ALTERACOES.md` (este arquivo)

### Como conferir à mão

1. Crie uma conta de prestador e não monte o perfil. Ela não deve aparecer em `/prestadores`.
2. Em **Meu perfil**, salve com categorias e bairros. Ela passa a aparecer.
3. Filtre por uma das categorias: o cartão continua mostrando todas as categorias dela.
4. Com a API, `PUT /api/prestadores/meu-perfil` com `{"categorias": []}` deve devolver 400.

---

## Fase 2: Sessão (US02 e US03)

### Item 5. Redefinir a senha encerra as sessões abertas (US03)

**Problema.** O Word pede *"invalidar o token após o uso e encerrar as sessões ativas"*.
O JWT é stateless e nada o invalidava: depois de trocar a senha, quem tinha um token antigo
(por exemplo, um invasor com a sessão aberta) continuava logado por até 8 horas.

**Como ficou.**
- `models/Usuario.js`: nova coluna `token_versao` (inteiro, padrão 0).
- `utils/token.js`: o JWT agora leva a versão (`v`) com que foi emitido.
- `middlewares/auth.js`: se `v` do token for diferente do `token_versao` atual do usuário, responde 401 "Sessao encerrada".
- `controllers/authController.js` (`redefinirSenha`): incrementa `token_versao` ao trocar a senha.

Tokens emitidos antes da mudança (sem `v`) valem como versão 0 e continuam funcionando até a primeira troca de senha.

**Atenção ao banco.** O projeto usa `sequelize.sync()`, que não altera tabelas já existentes.
Quem já tem o banco criado precisa rodar uma vez:

```sql
ALTER TABLE usuarios ADD COLUMN token_versao INT NOT NULL DEFAULT 0 AFTER bloqueado_ate;
```

Banco novo ou recriado já nasce com a coluna. (Aplicado no MySQL local deste ambiente.)

### Item 4. Token expirado devolve o usuário ao login (US02)

**Problema.** O front só conferia o token ao carregar a página. Se a sessão expirasse
com a tela aberta, o usuário via uma mensagem de erro e continuava na tela.

**Como ficou.**
- `frontend/src/servicos/api.js`: toda chamada autenticada que volta 401 dispara o evento `fecho:sessao-expirada`.
  Chamadas sem autenticação (login) não disparam, porque lá 401 significa senha errada.
- `frontend/src/contexto/AuthContexto.jsx`: escuta o evento, limpa o token e o usuário, e marca `sessaoExpirada`.
  `RotaPrivada` já manda quem não tem usuário para `/entrar`.
- `frontend/src/paginas/Entrar.jsx`: mostra "Sua sessão terminou. Entre de novo para continuar."
  O aviso some ao entrar ou sair manualmente.

Isso cobre também o item 5: a sessão encerrada por troca de senha cai no mesmo fluxo.

### Item 12. Limpeza no login

`authController.js` (`entrar`): removido o `if (status === 'excluido')` duplicado.

### Testes

`backend/testes/criterios.js`: 10 novos critérios na seção da US03 (**71 no total**, antes 61).
Só o último grupo falhava antes da correção; os demais já funcionavam e agora estão cobertos.

- o pedido gera um token novo no link
- senha fraca na redefinição é recusada sem gastar o link
- link válido redefine a senha
- link já usado não redefine de novo
- outros links pendentes perdem a validade após o uso
- link expirado não redefine
- senha antiga não funciona mais; a nova funciona
- **sessão aberta antes da redefinição é encerrada** (era a falha)
- sessão aberta depois da redefinição funciona

Também conferido na API real: token antigo devolve 401 após subir o `token_versao`; token novo devolve 200.
O build do frontend (`vite build`) compila sem erros.

### Arquivos alterados na fase 2

- `backend/src/models/Usuario.js`
- `backend/src/utils/token.js`
- `backend/src/middlewares/auth.js`
- `backend/src/controllers/authController.js`
- `backend/testes/criterios.js`
- `frontend/src/servicos/api.js`
- `frontend/src/contexto/AuthContexto.jsx`
- `frontend/src/paginas/Entrar.jsx`

### Como conferir à mão

1. Entre no site e deixe a aba aberta.
2. Em outra aba, peça a recuperação de senha, abra o link do console do backend e troque a senha.
3. Na primeira aba, clique em qualquer coisa que consulte a API (por exemplo, **Minha conta**): você volta para o login com o aviso de sessão terminada.

### Pendência encontrada (fora do escopo desta fase)

`backend/schema.sql` está desatualizado em relação aos modelos (falta o status `inativo`,
`cpf_hash`, `conta_anterior_id`, `bloqueado_novo_cadastro`, `desativado_em`, `reativado_em` e agora `token_versao`).
A aplicação não depende dele, mas quem criar o banco por esse arquivo terá um esquema incompleto.
Sugestão: atualizar na Fase 4 ou 5.
---

## Fase 3: Cadastro e perfil no front (US01 e US05)

### Item 3. CPF validado antes do envio, com máscara (US01)

**Problema.** O critério diz *"CPF inválido é recusado antes do envio"*, mas a tela só mandava o valor para a API.

**Como ficou.**
- `frontend/src/utils/formatos.js` (novo): `formatarCpf`, `cpfValido` (mesma conta de dígitos verificadores do backend), `formatarTelefone`, `telefoneValido`.
- `frontend/src/paginas/CriarConta.jsx`:
  - o CPF ganha máscara `000.000.000-00` enquanto se digita;
  - ao sair do campo, um CPF inválido mostra "Esse CPF não é válido." embaixo do campo;
  - ao enviar, CPF ou telefone inválidos barram o envio com mensagem, sem chamar a API.

### Item 9. E-mail, telefone e nome tratados no backend (US01)

**Problema.** `Ana@x.com` e `ana@x.com` viravam contas diferentes; e-mail e telefone não eram validados; nome com espaços sobrando era gravado como veio.

**Como ficou.**
- `backend/src/utils/contato.js` (novo): `normalizarEmail` (sem espaços, minúsculas), `emailValido`, `normalizarTelefone`, `fotoValida`.
- `authController.js`:
  - cadastro, login e "esqueci a senha" usam o e-mail normalizado;
  - e-mail sem formato válido: 400 "Esse e-mail nao parece valido.";
  - telefone, quando informado, precisa ter DDD + 8 ou 9 dígitos (10 ou 11 dígitos); é gravado só com os dígitos;
  - nome é aparado e limitado a 120 caracteres.
- `contaController.js` (`PUT /conta`): mesma validação de telefone e de nome.
- `frontend/src/paginas/MinhaConta.jsx`: telefone mostrado e editado com máscara `(19) 99999-9999`.

**Telefone obrigatório.** O texto da US01 diz "informando nome, CPF, e-mail, telefone e senha", então o telefone passou de opcional a obrigatório:
- `POST /auth/register` sem telefone ou com telefone em branco devolve 400;
- `PUT /conta` não deixa apagar o telefone (400), só trocá-lo por outro válido;
- o campo é `required` em **Criar conta** e em **Minha conta**, e `telefoneValido` no front deixou de aceitar vazio.
**Dados antigos.** Contas criadas antes, sem telefone, continuam entrando normalmente; o telefone só passa a ser exigido quando a pessoa editar os dados em **Minha conta**. No MySQL, a comparação de e-mail já ignora maiúsculas (collation `utf8mb4_unicode_ci`), então contas criadas antes continuam entrando.
Telefones antigos gravados com máscara continuam aparecendo normalmente, porque o front só usa os dígitos.

### Item 6. Foto do perfil com upload de imagem (US05)

**Problema.** A tela de edição do perfil não tinha campo de foto. A primeira versão usava o link de uma imagem, mas
na prática a pessoa cola o link de uma *página* (por exemplo, um artigo da Wikipédia) e nada aparece: o navegador
recebe HTML em vez de imagem. Link também depende de site de terceiros e faz quem vê o perfil carregar imagem de fora.
Por isso a foto passou a ser **enviada como arquivo**, e o campo de link foi removido.

**Como ficou (backend).**
- `PUT /api/prestadores/foto` (multipart, campo `foto`) e `DELETE /api/prestadores/foto`. Só para prestador com conta ativa.
- `servicos/armazenamento.js` (novo): grava em `backend/uploads/perfis/` (ou `UPLOADS_DIR`) com nome aleatório.
  É o único arquivo que sabe onde as fotos ficam; trocar por S3 ou similar mexe só nele.
- `middlewares/upload.js` (novo): `multer` em memória, limite de 2 MB. Acima disso, 413.
- O formato é conferido pelos **primeiros bytes** do arquivo (JPG, PNG ou WebP), não pelo nome nem pelo tipo informado pelo navegador.
  SVG é recusado, porque pode carregar script. Nada é gravado em disco antes dessa conferência.
- Trocar a foto apaga a antiga do disco. Remover a foto apaga o arquivo.
- **US04 / LGPD:** apagar os dados da conta agora remove também o arquivo da foto, não só o campo no banco.
  Desativar a conta mantém a foto (os dados ficam guardados).
- `app.js`: `/uploads` é servido com `X-Content-Type-Options: nosniff` e `Cross-Origin-Resource-Policy: cross-origin`
  (o front roda em outra porta). `backend/.gitignore` ignora `uploads`.
- `PUT /prestadores/meu-perfil` não aceita mais `foto_url`: a foto só entra pelo upload.
- A API só devolve `foto_url` quando o arquivo é do nosso armazenamento. Links externos gravados na primeira versão ficam invisíveis.
- Nova dependência: `multer` (versão 2).

**Como ficou (frontend).**
- `MeuPerfil.jsx`: botões **Escolher foto / Trocar foto / Remover**, com prévia imediata da imagem escolhida.
  A foto só é enviada ao clicar em **Salvar alterações**, para manter a regra "nada muda até você salvar".
  O front já recusa arquivo que não seja JPG, PNG ou WebP, ou com mais de 2 MB, antes de enviar.
  Se o perfil salvar mas a foto falhar, a tela avisa que o perfil foi salvo e que a foto não foi atualizada.
- `servicos/api.js`: suporte a envio de arquivo (`FormData`), `enviarFoto`, `removerFoto` e `urlDaFoto` (monta o endereço completo).
- `componentes/Avatar.jsx`: mostra a foto ou, se não houver ou falhar, a inicial do nome. Usado no perfil e nos cartões de **Profissionais**.
- Perfil começado pela metade (por exemplo, só a descrição) volta a abrir a edição com o que já estava salvo.

**Limites conhecidos.**
- Guardar em disco serve para desenvolvimento e para a apresentação. Em hospedagem real o disco costuma ser descartado a
  cada deploy; o certo é um armazenamento externo, e o módulo `armazenamento.js` já isola essa troca.
- A imagem não é redimensionada nem recodificada: 2 MB é o teto. Um redimensionamento (por exemplo, com `sharp`) pode vir depois.
- Documentos de identidade da US06 **não** devem passar por esse módulo (o requisito é nunca guardar a imagem do documento).
- Quem testou a primeira versão e gravou um link de foto no banco: o valor continua na coluna `foto_url`, mas a API o ignora.

### Testes

`backend/testes/criterios.js`: **102 critérios no total** (eram 71 ao fim da Fase 2). Os novos falhavam antes da implementação.
Os testes usam uma pasta temporária para as fotos, nunca `backend/uploads`.

Cadastro (US01):
- e-mail inválido, telefone inválido, telefone ausente e telefone em branco são recusados
- e-mail repetido só com maiúsculas é recusado (409)
- cadastro com CPF mascarado, e-mail com espaços e maiúsculas, nome com espaços e telefone com máscara
- login não diferencia maiúsculas no e-mail
- não dá para apagar o telefone ao editar a conta; trocar o telefone guarda só os dígitos

Foto (US05 e US04):
- recusa envio sem arquivo, texto disfarçado de PNG, SVG e arquivo acima de 2 MB
- contratante não envia foto (403) e envio sem login é recusado (401)
- aceita PNG, devolve o endereço, e a foto abre como `image/png` com `nosniff`
- salvar o perfil sem foto não apaga a foto; link externo não é mais aceito
- trocar por JPEG apaga o arquivo antigo; remover apaga o arquivo e limpa o perfil; remover sem foto não dá erro
- desativar a conta mantém a foto; apagar os dados da conta remove o arquivo do disco

Conferido também na API real (MySQL), com `curl.exe` enviando arquivo de verdade: upload, abertura da foto com os headers certos,
texto disfarçado recusado e remoção. A conta de teste foi apagada no fim. O build do frontend compila sem erros.
Não há testes automatizados do front; a parte visual precisa ser vista no navegador.

### Arquivos alterados na fase 3

Backend:
- `src/utils/contato.js` (novo), `src/servicos/armazenamento.js` (novo), `src/middlewares/upload.js` (novo)
- `src/controllers/authController.js`, `contaController.js`, `prestadorController.js`
- `src/routes/index.js`, `src/app.js`
- `testes/criterios.js`, `.gitignore`, `package.json`, `package-lock.json` (multer)

Frontend:
- `src/utils/formatos.js` (novo), `src/componentes/Avatar.jsx` e `avatar.css` (novos)
- `src/servicos/api.js`
- `src/paginas/CriarConta.jsx`, `MinhaConta.jsx`, `MeuPerfil.jsx`, `Prestadores.jsx`, `painel.css`

### Como conferir à mão

1. **Criar conta**: digite um CPF errado (por exemplo `111.111.111-11`) e saia do campo: aparece o erro embaixo. Tente enviar: nada é mandado à API.
2. Digite o CPF `529.982.247-25`: a máscara aparece sozinha, sem erro. O telefone também ganha a máscara e é obrigatório.
3. Crie a conta com o e-mail `Teste@Exemplo.COM` e entre depois com `teste@exemplo.com`: funciona.
4. **Meu perfil** (conta de prestador): clique em **Escolher foto** e selecione uma imagem JPG, PNG ou WebP do computador.
   A prévia aparece na hora. Clique em **Salvar alterações**: a foto aparece no perfil e em **Profissionais**.
5. Escolha um arquivo que não seja imagem (por exemplo, um `.pdf`) ou uma imagem acima de 2 MB: o erro aparece antes de enviar.
6. Clique em **Remover** e salve: a foto some e volta a inicial do nome. O arquivo também some da pasta `backend/uploads/perfis`.

---

## Enxugamento do escopo: só os cards 01, 02, 03, 04, 05, 07 e 08

O cliente pediu apenas esses sete cards no Sprint 1. Cada tarefa e critério do Word foi comparado com o código,
e o que não pertence a nenhum deles foi removido. Parte vinha do código original, parte foi acrescentada nesta branch.

### O que foi removido

| O que saiu | Pertence a | Onde estava |
|---|---|---|
| Corrente de contas (`conta_anterior_id`, `servicos/historico.js`, aviso "histórico recuperado") | Reputação, Sprint 3 | `Usuario`, cadastro, `CriarConta.jsx` |
| Impressão digital do CPF (`cpf_hash`, `impressaoCpf`, `CPF_PEPPER`) — **voltou**, ver *Um CPF, uma conta* | Não está no US04 | `Usuario`, `utils/cpf.js`, exclusão definitiva, `.env.example` |
| Banimento (`bloqueado_novo_cadastro`) — **a regra voltou**, ver *Um CPF, uma conta* (a tela continua na US25) | US25 (painel do administrador) | `Usuario`, cadastro |
| Bloqueio após 5 tentativas de login (`tentativas_login`, `bloqueado_ate`) | Não está no US02 | `Usuario`, login, redefinição de senha |
| Selo "Verificado" (`Prestador.verificado`) | US06 | `Prestador`, perfil da API, `Prestadores.jsx` |
| Perfil `administrador` e status `suspenso` do **usuário** | US25 | enums de `Usuario`, login |
| `PUT /api/conta` e o formulário de editar dados em **Minha conta** | Nenhum card pede editar o cadastro | `contaController`, rotas, `MinhaConta.jsx`, `api.js` |
| Filtros de categoria e bairro na listagem, atalhos e seletores na tela | US09 (busca) | `prestadorController.listar`, `Prestadores.jsx` |
| `Bairro.regiao` | Não era usado | `Bairro`, seed |

### O que continua (e por quê)

- **Desativar, reativar e apagar os dados da conta** (US04): foi informado que o cliente pediu a retenção de conta inativa.
- **Pendências que bloqueiam a saída** (US04): critério "bloquear enquanto houver serviço em andamento ou valor retido".
- **Status `suspenso` do prestador** (US07): o card pede o campo com ativo, pausado e suspenso.
- **Foto de perfil por upload** (US05): o card pede "tela de edição de perfil com foto".
- **Encerrar sessões ao trocar a senha** (US03) e **voltar ao login com token expirado** (US02): estão nos cards.
- **Validação de e-mail, telefone e CPF e telefone obrigatório** (US01): "validação dos campos" e o texto da história.
- **Listagem simples de prestadores**: necessária para demonstrar os critérios da US05, US07 e US08. Ficou só com
  o filtro "apenas mulheres" (US08) e mostra apenas prestadores ativos com ao menos uma categoria e um bairro.

### Comportamentos que mudaram

- Contas sem os campos removidos funcionam igual. Quem apaga os dados da conta agora **libera o CPF**: um novo cadastro com ele
  é uma conta nova, sem nenhum vínculo com a antiga.
- Depois de cadastrado, o usuário não edita nome, telefone ou sexo. **Minha conta** só mostra os dados e oferece desativar,
  reativar e apagar.
- Cadastro e login não têm mais limite de tentativas.

### Banco de dados

Foram removidas do MySQL local as colunas `usuarios.cpf_hash`, `conta_anterior_id`, `bloqueado_novo_cadastro`, `tentativas_login`,
`bloqueado_ate`, `prestadores.verificado` e `bairros.regiao`, e os valores `administrador` e `suspenso` dos enumerados de `usuarios`.
Só havia duas contas de teste, nenhuma usando esses campos. Quem já tem banco criado pode rodar:

```sql
ALTER TABLE usuarios
  DROP COLUMN cpf_hash, DROP COLUMN conta_anterior_id, DROP COLUMN bloqueado_novo_cadastro,
  DROP COLUMN tentativas_login, DROP COLUMN bloqueado_ate,
  MODIFY tipo_perfil ENUM('contratante','prestador') NOT NULL,
  MODIFY status ENUM('ativo','inativo','excluido') DEFAULT 'ativo';
ALTER TABLE prestadores DROP COLUMN verificado;
ALTER TABLE bairros DROP COLUMN regiao;
```

Deixar as colunas antigas no banco também funciona (a aplicação simplesmente não as usa); o `ALTER` só evita divergência com os modelos.

### Testes

`npm run teste`: **89 critérios, 0 falhas** (eram 102). Saíram os testes das funcionalidades removidas: corrente de contas, banimento,
`cpf_hash`, filtros de categoria e bairro, edição de telefone pela conta. Dois testes foram adaptados para não depender do `PUT /conta`
(conta inativa bloqueada e conta reativada voltando a usar a plataforma). O build do frontend compila sem erros.

### Plano revisado

- **Cancelado:** rate limit, helmet e limite de JSON; script do administrador; teste de bloqueio após 5 tentativas;
  recuperar senha de conta inativa. Nada disso está nos cards.
- **Mantido para a fase 4:** registrar data e origem da exclusão (US04), histórico de pausas (US07), a nota de finalidade do
  filtro entre mulheres (US08, já na README) e atualizar o `backend/schema.sql`.
- **Em aberto com o cliente:** o prazo de retenção da conta inativa (valor e o que acontece quando vence).
- **Decisão pendente:** a landing page (`Inicio.jsx`) apresenta Pix retido, disputa, taxa de 8% e histórico, que são de sprints
  futuros. Não foi alterada.

---

## Fase 4: itens finais (US04, US07, US08) e home enxuta

### Item 7. Data e origem do pedido de exclusão (US04)

O Word pede *"registrar data e origem da solicitação"*. Antes só existiam `desativado_em` e `excluido_em`.

- Tabela nova `solicitacoes_exclusao` (modelo `SolicitacaoExclusao`): `usuario_id`, `tipo` (`desativacao` ou `exclusao_dados`),
  `origem` (hoje só `painel_usuario`), `resultado` (`concluida` ou `recusada_pendencia`) e `created_at`.
- `contaController.js`: grava um registro em cada pedido. O pedido recusado por haver pendência também fica registrado.
  Pedido com a confirmação digitada errada ou conta ainda ativa (no caso da exclusão de dados) não é registrado, porque nem chega a ser um pedido válido.
- O registro guarda só o id do usuário, sem dado pessoal, então sobrevive à anonimização da conta.
- Não guardei IP nem aparelho: seria dado pessoal além do que o card pede.

### Item 8. Histórico de pausas (US07)

O card pede *"impedir que o tempo pausado conte como demora na resposta"*. Para isso é preciso saber **quando** o perfil esteve pausado, e antes só havia `pausado_em`, que era apagado ao retomar.

- Tabela nova `pausas` (modelo `Pausa`): `prestador_id`, `inicio`, `fim` (vazio = pausa em andamento).
- `servicos/pausas.js` (novo): `iniciarPausa`, `retomar` e `encerrarPausa`. Pausar pelo botão, desativar a conta e apagar os dados passam por aqui,
  então o histórico nunca diverge do status.
- A regra de descontar o tempo de resposta só pode ser aplicada na US10 (solicitação de serviço); aqui fica a base de dados pronta.

### Item 11. Finalidade do filtro entre mulheres (US08)

A README agora registra que a finalidade do filtro é a segurança pessoal de quem recebe alguém em casa, não segmentação comercial.

### `backend/schema.sql` atualizado

Reescrito a partir dos modelos atuais (estava sem `inativo`, `token_versao`, `pausas`, `solicitacoes_exclusao` e com colunas que saíram).
Validado rodando o script inteiro num banco temporário: cria as 10 tabelas sem erro.

### Home enxuta

A home descrevia Pix retido, orçamento, disputa, taxa de 8%, histórico e avaliações, que são de sprints futuros, e não tinha função além de apresentação.
Ficou só com o que existe hoje:

- capa com os dois caminhos (preciso de um serviço / quero oferecer meu trabalho);
- as categorias, que vêm da API;
- "para quem precisa" e "para quem trabalha", citando apenas o que o sistema faz (perfil completo, filtro entre mulheres, apagar os dados, até 5 serviços e bairros, pausar o perfil);
- chamada final para criar conta.

Saíram o painel que simulava o pagamento retido, os quatro passos do fluxo, o comparativo, as perguntas frequentes e o CSS correspondente.
Também foram ajustados a lateral das telas de conta, o rodapé (que apontava para seções que não existem mais) e o título da página, que prometiam "dinheiro garantido".
Quando o pagamento retido for entregue, a versão completa da home está no histórico do Git (commit anterior a este) e pode voltar.

### Testes

`npm run teste`: **95 critérios, 0 falhas** (eram 89). Novos:
- cada pausa vira um período com início e fim; pausa em andamento fica com o fim em aberto; o histórico guarda todos os períodos e nenhum fica aberto depois de retomar;
- o pedido recusado por pendência fica registrado com data e origem; cada pedido concluído fica registrado (2 desativações e 1 exclusão); o registro sobrevive à anonimização.

O build do frontend compila sem erros.

### Arquivos alterados nesta fase

- Backend: `models/Pausa.js`, `models/SolicitacaoExclusao.js` (novos), `models/index.js`, `servicos/pausas.js` (novo),
  `controllers/contaController.js`, `controllers/prestadorController.js`, `schema.sql`, `testes/criterios.js`
- Frontend: `paginas/Inicio.jsx`, `paginas/inicio.css`, `componentes/MolduraAuth.jsx`, `componentes/Rodape.jsx`, `componentes/Cabecalho.jsx`, `index.html`
- `README.md` e `ALTERACOES.md`

### Banco local

As tabelas `pausas` e `solicitacoes_exclusao` foram criadas sozinhas pelo `sequelize.sync()` quando a API reiniciou. Quem tem banco antigo só precisa reiniciar a API.

### Em aberto

- **Prazo de retenção da conta inativa:** implementado depois, na seção *Retenção de conta inativa* abaixo.

### Correção: botão "Criar conta" do cabeçalho

O botão aparecia invisível e só ficava amarelo ao passar o mouse. A regra genérica dos links do menu
(`.cabecalho__menu a { background: none }`) era mais específica que `.cabecalho__cta` e apagava o fundo, deixando o texto escuro
sobre o cabeçalho escuro. A regra do botão passou a `.cabecalho .cabecalho__cta` (`cabecalho.css`), o que também corrige o menu do celular.

---

## Retenção de conta inativa (US04)

Até aqui a conta desativada ficava guardada para sempre, o que não combina com a LGPD (arts. 15 e 16: o dado deve ser eliminado quando a
finalidade acaba). Foi aplicada a recomendação pesquisada pelo grupo, **a confirmar com o cliente**.

### Regras

| Decisão | Como ficou |
|---|---|
| Prazo | **12 meses** depois de desativar (`RETENCAO_MESES` no `.env`) |
| O que acontece | **Anonimiza**, igual ao botão "Apagar meus dados" (mantém o registro da conta, sem identificar a pessoa) |
| Aviso | E-mail **30 dias antes** (`RETENCAO_AVISO_DIAS`). Sem SMTP, o aviso aparece no console |
| Se voltar | **Entrar na conta zera o relógio** e cancela o aviso |
| Pendências | Conta com serviço em andamento ou valor retido **nunca** é anonimizada |
| Aviso atrasado | Se a rotina ficar parada e o aviso sair tarde, a exclusão espera completar os 30 dias |
| Registro | Cada exclusão automática grava em `solicitacoes_exclusao` com origem `rotina_automatica` |

### Como foi feito

- `servicos/anonimizacao.js` (novo): `anonimizarConta`, extraída do botão "Apagar meus dados". O botão e a rotina usam a mesma função,
  então os dois caminhos nunca divergem (apaga também o arquivo da foto e encerra a pausa).
- `servicos/retencao.js` (novo): `processarRetencao` e `iniciarRotinaRetencao`. A rotina roda ao iniciar a API e a cada 24 horas
  (`server.js`). Uma conta com erro não trava as outras.
- `Usuario`: colunas `ultimo_acesso_em` e `aviso_retencao_em`. O relógio conta a partir do mais recente entre `desativado_em` e `ultimo_acesso_em`.
  O login grava o último acesso e cancela o aviso.
- `utils/email.js`: `enviarAvisoRetencao`, com a mesma saída para o console quando não há SMTP.
- `SolicitacaoExclusao.origem` ganhou o valor `rotina_automatica`.
- Front: **Minha conta** e o aceite dos termos em **Criar conta** informam o prazo de 12 meses e o aviso de 30 dias (valores fixos no texto;
  se o `.env` mudar, o texto precisa mudar junto).

### Banco de dados

Quem já tem o banco criado precisa rodar uma vez (já aplicado no MySQL local):

```sql
ALTER TABLE usuarios
  ADD COLUMN ultimo_acesso_em DATETIME NULL AFTER token_versao,
  ADD COLUMN aviso_retencao_em DATETIME NULL AFTER ultimo_acesso_em;
ALTER TABLE solicitacoes_exclusao
  MODIFY origem ENUM('painel_usuario','rotina_automatica') NOT NULL DEFAULT 'painel_usuario';
```

O `schema.sql` já foi atualizado e validado.

### Testes

`npm run teste`: **106 critérios, 0 falhas** (eram 95). Os testes simulam o passar do tempo passando a data para `processarRetencao`:
conta recém desativada não é tocada; conta ativa nunca é tocada; a 30 dias do vencimento recebe o aviso, e o aviso não se repete;
passou o prazo sem os 30 dias de aviso: nada é apagado; cumpridos prazo e aviso: anonimiza; a exclusão fica registrada com origem da rotina;
entrar na conta zera o relógio; conta com pendência nunca é anonimizada, e resolvida a pendência a rotina conclui.
O build do frontend compila sem erros.

### Limites

- A rotina só roda enquanto a API está no ar. Em hospedagem real, vale um agendador externo (cron) chamando a mesma função.
- Não há registro de acesso (log) além do último login; o art. 15 do Marco Civil (6 meses de registros de acesso) não pesa hoje, mas deve ser revisto se a plataforma passar a guardar logs.
- O prazo e o comportamento (anonimizar, e não apagar tudo) continuam sendo uma recomendação até o cliente confirmar.

---

## Um CPF, uma conta (US04)

### Por que voltou

O enxugamento tinha tirado a impressão do CPF, e com isso "Apagar meus dados" liberava o CPF: a pessoa apagava a conta e
criava outra, limpa, com o mesmo CPF. Isso conflita com a decisão do grupo para a US04 (guardar a impressão do CPF; quem foi
banido não volta) e abre uma brecha de segurança: apagar a conta para fugir de avaliação ruim, de cancelamentos ou de disputa.

### Regra

- **Um CPF, uma conta.** O cadastro grava a impressão do CPF (`cpf_hash`). Ela continua no banco depois de apagar os dados.
- Quem apaga os dados e se cadastra de novo com o mesmo CPF **reabre a mesma conta** (mesmo `id`), e não uma conta nova.
  Preenche os dados pessoais de novo (foram apagados a pedido dela); o histórico ligado ao `id` continua o mesmo.
- O perfil de prestador recomeça vazio (descrição, foto, categorias e bairros foram apagados), mas volta a poder ser montado e pausado.
- Token de sessão e link de troca de senha emitidos antes da exclusão **não** voltam a valer na conta reaberta.
- CPF banido (`bloqueado_novo_cadastro = true`) não reabre a conta: 403 "Não é possível criar conta com esse CPF. Fale com o suporte."
  Quem marca é a administração; a tela é a US25.
- Conta ativa ou inativa com o mesmo CPF continua recusando um cadastro novo (409), como antes.

**Mudança em relação à decisão anterior do grupo:** a versão antiga criava uma conta nova ligada à anterior por `conta_anterior_id`,
e toda consulta de reputação precisaria percorrer essa corrente. Reabrir o mesmo registro dá o mesmo resultado sem corrente:
avaliações (US24), contagem de serviços concluídos para a taxa (US21) e cancelamentos seguem o `id` sem consulta especial.
**Levar ao grupo** para atualizar a base de decisões.

### LGPD

A impressão é HMAC-SHA256 com a chave `CPF_PEPPER` do `.env` (só existem 10^11 CPFs, então um SHA-256 puro seria revertido por
força bruta). Sem a chave, o banco não devolve nenhum CPF. Mesmo assim ela é dado pessoal pseudonimizado, guardado com uma
finalidade: prevenção a fraude. O aceite em **Criar conta** e a tela **Apagar meus dados** passaram a avisar isso; falta colocar
nos termos de uso (pendência já listada no guia).

### Como foi feito

- `utils/cpf.js`: `impressaoCpf` (HMAC com `CPF_PEPPER`; em produção, sem a chave, a API recusa em vez de usar a chave de desenvolvimento).
- `models/Usuario.js`: colunas `cpf_hash` (única) e `bloqueado_novo_cadastro`.
- `controllers/authController.js` (`cadastrar`): grava a impressão; procura conta ativa/inativa por e-mail, CPF ou impressão (409);
  procura conta `excluido` pela impressão (403 se banida; senão reabre).
- `servicos/reabertura.js` (novo): `reabrirConta`, numa transação: dados novos, status `ativo`, novo aceite dos termos,
  `token_versao` + 1 e perfil de prestador de volta a `ativo` (vazio).
- `servicos/anonimizacao.js`: mantém a impressão (e cria para contas antigas que ainda não tinham), invalida links de senha pendentes
  e sobe o `token_versao`.
- `controllers/contaController.js`: a mensagem depois de apagar deixou de dizer "Essa conta não volta".
- Front: aviso de conta reaberta com botão **Continuar** em **Criar conta**; textos novos no aceite dos termos e em **Apagar meus dados**.
- `.env.example` (`CPF_PEPPER`), `schema.sql`, `README.md` e `GUIA-APRESENTACAO-SPRINT1.md` atualizados.

### Banco de dados

`sequelize.sync()` não cria colunas em tabela existente. Quem já tem o banco precisa rodar uma vez:

```sql
ALTER TABLE usuarios
  ADD COLUMN cpf_hash VARCHAR(64) NULL AFTER cpf,
  ADD UNIQUE INDEX cpf_hash (cpf_hash),
  ADD COLUMN bloqueado_novo_cadastro TINYINT(1) NOT NULL DEFAULT 0 AFTER token_versao;
```

Contas já existentes ficam com `cpf_hash` vazio até apagarem os dados (a impressão é criada nessa hora) e continuam barrando
cadastro repetido pelo CPF. Contas que foram apagadas **antes** desta mudança não têm impressão e não são reconhecidas: eram contas de teste.

Defina a `CPF_PEPPER` no `backend/.env` antes de criar contas e não troque depois.

### Testes

`npm run teste`: **121 critérios, 0 falhas** (eram 107). Saiu "após apagar os dados o CPF fica livre"; entraram 15, e 10 deles falhavam no código anterior:

- o cadastro já grava a impressão do CPF, não o número; apagar tira o CPF e guarda a impressão
- cadastro com o mesmo CPF reabre a **mesma** conta (mesmo `id`), ativa, com os dados novos e o CPF de volta; os dados antigos não voltam
- o histórico continua ligado à mesma conta; entra com o e-mail e a senha novos
- token e link de senha de antes da exclusão não valem na conta reaberta
- com a conta reaberta, o mesmo CPF volta a ser recusado; CPF diferente cria conta nova
- CPF banido não reabre nem cria conta
- prestadora que apagou volta com perfil vazio, aparece de novo na listagem e consegue pausar

O build do frontend compila sem erros. A tela de conta reaberta foi conferida no navegador (largura de celular).

### Como conferir à mão

1. Crie uma conta, desative e use **Apagar meus dados**.
2. No Workbench: `SELECT id, nome, cpf, cpf_hash, status FROM usuarios;` → sem CPF, com `cpf_hash`, status `excluido`.
3. Em **Criar conta**, use o mesmo CPF com outro e-mail → aviso de conta reaberta → **Continuar**.
4. Repita o `SELECT`: mesmo `id`, status `ativo`.

