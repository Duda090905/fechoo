# Registro de alterações

Branches: `Alterações-(correções-sprint-1)` (Sprint 1), `Sprint-2` (seção [Sprint 2](#sprint-2-us09-us10-us12-us13-e-us26)), `Sprint-3` (seção [Sprint 3](#sprint-3-us06-us11-us17-e-us18)) e `Sprint-4` (seção [Sprint 4](#sprint-4-us20-us24-us15-us21-us14-e-us16), no fim deste arquivo).

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
| Sprint 2 | US09, US10, US12, US13 e US26 (curinga CC06) | Concluída |
| Sprint 5 (final) | US23, US25, US19 e US22 ([seção no fim](#sprint-5-final-us23-us25-us19-e-us22)) | Concluída |
| Sprint 3 | US06, US11, US17 e US18 | Concluída |
| Sprint 4 | US20, US24, US15, US21, US14 e US16 (35 pontos) | Concluída |

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
| Impressão digital do CPF (`cpf_hash`, `impressaoCpf`, `CPF_PEPPER`) | Não está no US04 | `Usuario`, `utils/cpf.js`, exclusão definitiva, `.env.example` |
| Banimento (`bloqueado_novo_cadastro`) | US25 (painel do administrador) | `Usuario`, cadastro |
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

## Sprint 2: US09, US10, US12, US13 e US26

Branch: `Sprint-2`. Cards definidos com o professor: US09, US10, US12, US13 e o curinga CC06, que entrou como **US26** (o curinga recebe o próximo número do backlog quando entra numa sprint).

Regra seguida: cada tarefa do "O que será feito" e cada critério de aceite dos cinco cartões tem código e teste; nada que nenhum cartão pede foi construído. As tabelas abaixo ligam cada linha do cartão ao arquivo e ao teste.

### US09 - Busca por categoria e bairro

| No cartão | Onde está |
|---|---|
| Endpoint GET /api/prestadores com filtro por categoria e bairro | `prestadorController.listar` (parâmetros `categoria` e `bairro`; `somente_mulheres` da US08 continua) |
| Ordenar por avaliação média e número de serviços concluídos | `ordenarParaBusca`: nota média (sem nota vai para o fim), depois concluídos (status `confirmado` ou `pago`), depois ordem de cadastro |
| Tela de listagem com cartão (nome, nota média, serviços concluídos, selo) | `Prestadores.jsx` |
| Índice no banco para os campos de filtro | `idx_prestador_categorias_categoria`, `idx_prestador_bairros_bairro`, `idx_prestadores_status` (modelos `PrestadorCategoria`, `PrestadorBairro`, `Prestador`) |

| Critério de aceite | Teste (`npm run teste`, seção US09) |
|---|---|
| Retorna apenas prestadores da categoria e do bairro escolhidos | "a busca por categoria...", "a busca por bairro...", "categoria e bairro juntos..." |
| Busca sem resultado exibe mensagem orientando o usuário | API: "busca sem resultado responde lista vazia"; tela: mensagem diz quem não foi encontrado e oferece procurar em todos os bairros |
| Prestador pausado ou suspenso não aparece | "prestador pausado nao aparece", "prestador suspenso nao aparece" |

**Nota média e selo.** O cartão pede os dois, mas quem os produz são outras histórias. Foram criadas as colunas `prestadores.nota_media` (a US24 grava a média) e `prestadores.verificado` (a US06 marca). A busca já lê, ordena e exibe; até essas histórias entrarem, todo mundo aparece "Sem avaliações ainda" e sem o selo. Os testes gravam valores direto no banco para provar a ordenação e o selo.

### US10 - Solicitação de serviço e orçamento

| No cartão | Onde está |
|---|---|
| Tabela Servicos (id, id_contratante, id_prestador, descricao, valor, taxa_deslocamento, status, datas) | `models/Servico.js` (mais `bairro_id`, `fotos`, `prazo_horas` e as datas da US13) |
| POST /api/servicos com envio de fotos | `servicoController.criar` + `receberFotosPedido` (até 3 fotos) |
| Tela do prestador para responder valor, prazo e taxa de deslocamento quando fora da área | `ServicoDetalhe.jsx` (`FormularioOrcamento`) e `POST /api/servicos/:id/orcamento` |
| Controlar os status Aguardando orçamento, Orçamento enviado e Recusado | `aguardando_orcamento`, `orcamento_enviado`, `recusado` |

| Critério de aceite | Teste (seção US10) |
|---|---|
| A solicitação aparece na lista de pendências do prestador | "a solicitacao aparece na lista de pendencias do prestador" (na tela: grupo "Esperando seu orçamento" e contador na aba) |
| O orçamento chega ao contratante com valor, prazo e deslocamento separados | "o orcamento chega ao contratante com valor, prazo e deslocamento separados" |
| Valor zerado ou negativo é recusado | "valor zerado ou negativo e recusado" |
| O contratante consegue recusar e o serviço é encerrado | "o contratante consegue recusar e o servico e encerrado" |

**Fotos do pedido.** Conferidas pelo conteúdo (JPG, PNG, WebP, 2 MB). A localização que o celular grava dentro da foto (EXIF/XMP, com GPS) é apagada antes de salvar (`servicos/metadados.js`): o contratante tira a foto em casa, e o arquivo original entregaria o endereço ao prestador antes do aceite. As fotos ficam em `uploads/servicos`, fora da pasta pública; só as duas partes abrem, por `GET /api/servicos/:id/arquivos/:nome`. Para isso a pasta pública passou a ser só `uploads/perfis` (`app.js`); o endereço das fotos de perfil não mudou.

**US02, quarto critério.** "Usuário A não consegue acessar, pela URL, um serviço pertencente ao usuário B" dependia da tabela de serviços e agora está provado (seção US02 dos testes): quem não é parte recebe 404.

### US13 - Agendamento de data e hora

| No cartão | Onde está |
|---|---|
| Data e hora na solicitação e na proposta | `data_hora_solicitada` (contratante) e `data_hora_proposta` (orçamento) |
| Agenda de compromissos no painel | `GET /api/servicos/agenda` e aba **Agenda** em Meus serviços (para os dois lados) |
| Bloquear horário já ocupado pelo mesmo prestador | `horarioOcupado`: ocupam o orçamento enviado e o compromisso aceito, do horário até o fim do prazo |
| Lembrete às duas partes na véspera | `servicos/lembretes.js`, de hora em hora, uma vez por serviço (sem SMTP, vai para o console) |

| Critério de aceite | Teste (seção US13) |
|---|---|
| Não é possível agendar dois serviços no mesmo horário para o mesmo prestador | "nao e possivel agendar dois servicos no mesmo horario..." e "o prestador nao propoe horario que ja esta ocupado" |
| Data no passado é recusada | "data no passado e recusada na solicitacao" e "...na proposta" |
| O compromisso aparece na agenda dos dois lados após o aceite | "antes do aceite o compromisso nao esta na agenda" e "depois do aceite o compromisso aparece na agenda dos dois lados" |

**Aceite.** O aceite do orçamento é a US11, que não está nesta sprint. O teste simula o aceite gravando o status `aceito` no banco. Na tela, a agenda fica vazia até a US11 existir.

### US12 - Chat interno do serviço

| No cartão | Onde está |
|---|---|
| Tabela Mensagens vinculada ao serviço | `models/Mensagem.js` |
| Tela de conversa com envio de texto e imagem | `componentes/Chat.jsx` (na página do serviço), novas mensagens a cada 3 s |
| Liberar o chat apenas para as duas partes | `carregarDaParte` no `servicoController` |
| Definir prazo de retenção das mídias enviadas | 90 dias depois do encerramento do serviço (`MIDIAS_RETENCAO_DIAS`), aplicado por `servicos/retencaoMidias.js` |

| Critério de aceite | Teste (seção US12) |
|---|---|
| Um terceiro usuário não consegue abrir o chat | "um terceiro usuario nao consegue abrir o chat daquele servico" (ler, escrever e abrir imagem) |
| As mensagens ficam salvas e podem ser consultadas em caso de disputa | "as duas mensagens ficam salvas...", "nao existe forma de apagar mensagem", "depois de encerrado, as mensagens continuam disponiveis", "nenhuma mensagem e apagada pela rotina" |
| O chat encerra o envio de novas mensagens após a conclusão | "o chat encerra o envio de novas mensagens apos a conclusao do servico" |

**Por que 90 dias.** Cobre a disputa (aberta em até 72 horas depois da conclusão e decidida em até 7 dias) e o pedido de devolução de um Pix (MED), que pode ser feito em até 80 dias. Vencido o prazo, imagens do chat e fotos do pedido saem do disco; o texto fica, e o chat avisa que a imagem foi removida. **A confirmar pelo grupo.**

**Encerramento.** O chat fecha em `concluido` e em todos os status depois dele, e também quando o serviço encerra sem acontecer (`recusado`, `cancelado`, `expirado`). A data fica em `encerrado_em`, marcada sozinha pelo modelo em qualquer mudança para esses status, então as próximas histórias não precisam lembrar disso.

### US26 (curinga CC06) - Alterar a senha estando logado

| No cartão | Onde está |
|---|---|
| PUT /api/conta/senha exigindo a senha atual e a nova | `contaController.trocarSenha` |
| Mesma regra de força da criação de conta | `senhaForte` (a mesma do cadastro) |
| Encerrar as outras sessões e devolver um token novo | sobe o `token_versao` (mecanismo da US03) e responde com `token` |
| Tela de troca de senha em Minha conta | cartão **Senha** em `MinhaConta.jsx` |

| Critério de aceite | Teste (seção US26) |
|---|---|
| Senha atual incorreta é recusada | "senha atual incorreta e recusada (sem derrubar a sessao)" |
| Nova senha fraca ou igual à atual é recusada | "nova senha fraca e recusada", "nova senha igual a atual e recusada" |
| Após a troca, a senha antiga não funciona e as outras sessões deixam de valer | "apos a troca, a senha antiga nao funciona..." e "as outras sessoes deixam de valer" |
| A sessão em que a troca foi feita continua ativa | "a sessao em que a troca foi feita continua ativa" |

Senha atual errada responde **400**, e não 401: no front, 401 significa sessão encerrada e levaria a pessoa de volta ao login.

### Decisões tomadas onde o cartão não dizia (confirmar com o grupo)

| Decisão | Por quê |
|---|---|
| Status da US10 com os nomes do cartão, não os da máquina de estados ("Solicitado", "Proposta enviada") | É o cartão que o professor confere. Os demais estados da máquina foram mantidos com os nomes dela |
| Prazo do orçamento = duração estimada em horas, de 1 a 24 | É o que permite saber até quando o horário do prestador fica ocupado (US13) |
| Até 3 fotos por pedido | O cartão pede fotos sem dizer quantas |
| Um horário fica ocupado pelo orçamento enviado, não pelo pedido | Só o prestador ocupa a própria agenda; um pedido sozinho não bloqueia ninguém |
| Quem atende apenas mulheres não recebe pedido de homem | Sem isso, a escolha da US08 deixava de valer no pedido |
| Mídias guardadas por 90 dias depois do encerramento | Ver US12 |

### Banco de dados

`servicos` e `mensagens` são criadas sozinhas pelo `sequelize.sync()`. Num banco que já existia no Sprint 1, rode uma vez:

```sql
ALTER TABLE prestadores
  ADD COLUMN nota_media DECIMAL(3,2) NULL AFTER atende_apenas_mulheres,
  ADD COLUMN verificado TINYINT(1) NOT NULL DEFAULT 0 AFTER nota_media;
CREATE INDEX idx_prestador_categorias_categoria ON prestador_categorias (categoria_id, prestador_id);
CREATE INDEX idx_prestador_bairros_bairro ON prestador_bairros (bairro_id, prestador_id);
-- Se o banco foi criado pelo schema.sql, este indice ja existe e o comando abaixo da erro de nome duplicado: pode ignorar.
CREATE INDEX idx_prestadores_status ON prestadores (status);
```

Conferido num MySQL 8: um banco do Sprint 1 com esse SQL fica idêntico a um banco criado do zero pelo Sprint 2. O `schema.sql` foi atualizado e validado rodando o script inteiro.

### Testes

`npm run teste`: **192 critérios, 0 falhas** (eram 107). São 85 novos: 14 da US09, 30 da US10 (pedido, fotos e orçamento), 3 da US02, 14 da US13, 16 da US12 e 8 da US26. A suíte também passa inteira contra MySQL 8. Antes de entregar, regras importantes foram desligadas uma de cada vez (bloqueio de horário, fechamento do chat, checagem de quem é parte, remoção do GPS, encerramento das sessões), e o teste correspondente falhou em todos os casos.

O build do frontend compila sem erros, e o fluxo completo foi percorrido no navegador.

### Arquivos

- Backend novos: `database/demo.js`, `models/Servico.js`, `models/Mensagem.js`, `models/PrestadorCategoria.js`, `models/PrestadorBairro.js`, `controllers/servicoController.js`, `servicos/metadados.js`, `servicos/lembretes.js`, `servicos/retencaoMidias.js`
- Backend alterados: `models/Prestador.js`, `models/Categoria.js`, `models/Bairro.js`, `models/index.js`, `controllers/prestadorController.js`, `controllers/contaController.js`, `routes/index.js`, `middlewares/upload.js`, `servicos/armazenamento.js`, `utils/email.js`, `app.js`, `server.js`, `schema.sql`, `.env.example`, `testes/criterios.js`
- Frontend novos: `paginas/Servicos.jsx`, `paginas/ServicoDetalhe.jsx`, `paginas/servicos.css`, `componentes/PedirOrcamento.jsx`, `componentes/pedir-orcamento.css`, `componentes/Chat.jsx`, `componentes/chat.css`, `componentes/ImagemProtegida.jsx`
- Frontend alterados: `paginas/Prestadores.jsx`, `paginas/prestadores.css`, `paginas/MinhaConta.jsx`, `componentes/Cabecalho.jsx`, `componentes/Icones.jsx`, `servicos/api.js`, `utils/formatos.js`, `estilos/global.css`, `App.jsx`

### Como conferir à mão

1. Entre como **prestador** e complete o perfil (categoria e bairro).
2. Em outra janela anônima, entre como **contratante**, vá em **Profissionais** e monte a frase "Preciso de [serviço] no bairro [bairro]" (US09). Escolha um bairro sem ninguém para ver a mensagem que orienta.
3. Clique em **Pedir orçamento**, escreva o pedido, escolha bairro, dia e hora e anexe uma foto (US10, US13). Tente uma data passada: é recusada.
4. Na janela do prestador, **Meus serviços** mostra o pedido em "Esperando seu orçamento". Abra, converse pelo chat (texto e imagem) e envie o orçamento (US10, US12). Peça num bairro que o prestador não atende para ver o campo de taxa de deslocamento.
5. Peça outro orçamento ao mesmo prestador no mesmo horário: é recusado (US13).
6. Como contratante, veja o comprovante com valor, deslocamento e total separados e **recuse**: o pedido é encerrado e o chat fica só para leitura nas duas janelas (US10, US12).
7. Em **Minha conta > Senha**, troque a senha (US26). A janela continua logada; uma sessão aberta antes em outro navegador volta para o login.
8. Para mostrar a agenda, o selo, a nota e o chat encerrado, use os dados de demonstração (`npm run db:demo`, seção abaixo).

### Dependências entre histórias e a demonstração

O INVEST (aula de User Stories) pede histórias independentes "sempre que possível". Três critérios desta sprint dependem de histórias que ficaram para depois:

| Critério desta sprint | Depende de | Como foi tratado |
|---|---|---|
| US13: o compromisso aparece na agenda após o aceite | US11 (aceite) | Agenda pronta; o aceite é simulado |
| US09: cartão com nota média e ordenação por avaliação | US24 (avaliação mútua) | Coluna `nota_media` lida e ordenada; a nota é simulada |
| US09: cartão com selo | US06 (verificação) | Coluna `verificado` lida e exibida; o selo é simulado |
| US12: o chat encerra após a conclusão | US20 (conclusão) | Encerramento pronto (também vale na recusa, que já existe); a conclusão é simulada |

Nenhuma dessas histórias foi construída. A simulação grava direto no banco o **resultado** que elas produziriam, sem tela nem endpoint, como um stub de teste. Ela existe em dois lugares:

- **Testes automáticos** (`npm run teste`): cada critério dependente tem a simulação marcada no código ("O aceite e a US11... simulado direto no banco").
- **Dados de demonstração** (`npm run db:demo`, arquivo `src/database/demo.js`): contas e serviços prontos para a apresentação, cada dado simulado comentado com a história que o produziria. Senha de todas as contas: `demo1234`. As datas partem do dia em que o comando roda; para recriar no dia da apresentação, `npm run db:demo -- --recriar`.

| Conta | O que mostra |
|---|---|
| `ana.demo@fecho.app` (contratante) | pedido esperando orçamento, orçamento para recusar ao vivo, compromisso amanhã na agenda, serviço concluído com o chat fechado |
| `bruno.demo@fecho.app` (contratante) | compromisso com taxa de deslocamento na agenda |
| `rita.demo@fecho.app` (prestadora) | selo e nota 4,8 na busca, 3 serviços concluídos, compromisso de amanhã na agenda |
| `eli.demo@fecho.app` (prestador) | pedido esperando o orçamento dele, para responder ao vivo |
| `joao.demo@fecho.app` (prestador) | sem nota e sem selo, para comparar na busca |

Ao subir a API com esses dados, o lembrete da véspera do compromisso de amanhã aparece no console (US13).

### Em aberto

- **Nota dos cards no Planning Poker:** este arquivo não traz as notas do Sprint 2; registrar quando o grupo votar.
- **Word das histórias:** criar o cartão US26 (texto do CC06) e marcar o CC06 como usado no documento dos curingas.
- **Máquina de estados x US10:** decidir se os três primeiros status ficam com os nomes do cartão (como está) ou com os da máquina.

---

## Sprint 3: US06, US11, US17 e US18

Branch `Sprint-3`, criada a partir da `Sprint-2`. Testes: `npm run teste` passa de 192 para **242** critérios, todos passando (os 50 novos ficam em `backend/testes/sprint3.js`).

### Decisões tomadas para não travar (levar ao grupo)

1. **O serviço vira Aceito quando o webhook confirma o Pix, não no clique.** A máquina de estados diz "Aceito (o dinheiro congela)", e a US11 libera o endereço no Aceito. No clique, o serviço continua em *Orçamento enviado* com o pagamento *Aguardando*. Resolve a incoerência 3 (que estava em aberto).
2. **No webhook, o serviço vai para Aceito, não para Pago.** A US18 no Word manda ir para Pago; isso contraria a máquina de estados (Pago só depois da confirmação e do repasse, US20). Resolve a incoerência 2.
3. **US06 aceita só chave Pix do tipo CPF.** Uma chave CPF só pode estar em conta do dono do CPF; então "chave = CPF do cadastro" prova a titularidade sem consulta paga. Outros tipos ficam para a produção (consulta ao Banco Central por serviço pago).
4. **O endereço é informado no aceite**, não no pedido. A US11 precisa de um endereço e nenhuma tela anterior o pedia; pedir só no aceite expõe o dado o mínimo possível (LGPD). Fica em `servicos.endereco`.
5. **Prazo para pagar o Pix: 30 minutos** (`PIX_EXPIRA_MINUTOS`). Não há número decidido; vencido, a cobrança é cancelada no Asaas (o QR dinâmico do Asaas, sozinho, valeria 12 meses).

### Textos dos cards que precisam mudar no Word

| Card | Hoje no Word | Como fica |
|---|---|---|
| US06 | Envio de documento, aprovação do administrador | **O que será feito:** cadastro da chave Pix no painel do prestador; conferência do titular da chave contra o CPF do cadastro; selo na busca e no perfil quando bate; nenhuma imagem de documento pedida ou guardada. **Critérios:** chave cujo titular não é o CPF do cadastro é recusada; o selo só aparece depois da conferência aprovada; nenhuma imagem de documento é enviada ou armazenada; o prestador recusado recebe o motivo e pode cadastrar outra chave. **Nota:** 3. |
| US11 | "Criar endpoint de mudança de status do serviço para Aceito" | "Criar endpoint de aceite do orçamento, com o endereço do atendimento; o serviço passa para Aceito quando o pagamento é confirmado (US18)." |
| US17 | "Cobrança expirada devolve o serviço ao status anterior" | "Cobrança expirada é cancelada e o serviço continua em Orçamento enviado, com o aceite liberado de novo." |
| US18 | "Alterar o status do pagamento para Retido e o do serviço para Pago"; "assinatura inválida" | "...para Retido e o do serviço para Aceito"; "Requisição com token inválido (cabeçalho asaas-access-token) é rejeitada com erro de autorização." |

### O que mudou

**Banco** (criado sozinho ao subir a API; nada de SQL à mão):
- Tabelas novas: `pagamentos` (status Aguardando, Retido, Liberado, Estornado; identificador único; id da cobrança no gateway; copia e cola; QR; prazo), `eventos_webhook` (id do evento único = idempotência), `acessos_endereco` (log da US11), `notificacoes` (um aviso por pessoa, serviço e tipo).
- Colunas novas: `servicos.endereco`, `servicos.aceito_em`, `usuarios.asaas_cliente_id`, `prestadores.chave_pix_tipo`, `prestadores.chave_pix`, `prestadores.verificado_em`.
- `backend/src/database/colunas.js`: ao subir, acrescenta as colunas que faltam nas tabelas que já existem. Não usa `sync({ alter: true })`, que duplica índice único a cada vez que roda.

**Back-end**
- `servicos/gateway/` — `asaas.js` (fetch do próprio Node, cabeçalho `access_token`, trava que recusa endereço que não seja de sandbox), `simulado.js` (gera um Pix copia e cola válido, com o valor no campo 54) e `index.js` (escolhe pelo `.env`).
- `servicos/cobrancas.js` — gera a cobrança com o total do orçamento (serviço + deslocamento), encerra cobrança vencida (cancela no gateway), aplica o webhook numa transação só (evento + pagamento Retido + serviço Aceito + avisos). Pix pago depois do prazo vale e cancela o Pix novo do mesmo serviço; Pix pago depois de recusado não reabre nada (fica registrado para devolução).
- `controllers/pagamentoController.js` — o webhook: compara o token em tempo constante; responde 200 até para aviso repetido ou ignorado (erro faria o Asaas reenviar e, depois de 15 falhas, pausar a fila).
- `servicoController.aceitar` — exige endereço; clique repetido devolve o mesmo Pix. `detalhar` entrega o endereço só do Aceito em diante e grava o log; lista e agenda nunca entregam. `recusar` cancela o Pix em aberto.
- `prestadorController.cadastrarChavePix` — US06. A chave aparece mascarada só no próprio perfil.
- `utils/pix.js` — monta e lê o BR Code (CRC16 conferido contra o exemplo do Banco Central).
- `scripts/pix-pagar.js` — `npm run pix:pagar -- <id>` (`--repetir`, `--token-errado`, `--local`).
- `anonimizacao.js` — "Apagar meus dados" também apaga a chave Pix, o selo e o id do cliente no Asaas.
- **US04 (commit separado):** serviço aceito e pagamento Retido passam a bloquear desativar e apagar a conta. É o critério que a US04 já pedia e que só agora tem como acontecer. Se o grupo preferir manter a sprint só com os 4 cards, basta reverter esse commit.

**Front-end**: `componentes/PagamentoPix.jsx` (+ `pagamento.css`), mudanças em `ServicoDetalhe.jsx`, `Servicos.jsx` (avisos e "Pix esperando pagamento") e `MeuPerfil.jsx` (cartão Receber pelo Pix).

**Demonstração** (`npm run db:demo -- --recriar`): orçamento do Eli para a Ana aceitar ao vivo (R$ 180 + R$ 20 de deslocamento), compromissos já pagos com endereço, Rita com a chave Pix conferida, Eli sem selo para cadastrar a chave ao vivo (o script imprime o CPF certo e um errado).

### Como conferir

1. `npm run teste` → 242 critérios, 0 falhas.
2. `Checklist Sprint 3 Fechô.md`: cada linha do "O que será feito" e cada critério dos 4 cards, com o teste e o passo na tela.

---

## Sprint 4: US20, US24, US15, US21, US14 e US16

Branch `Sprint-4`, criada a partir da `Sprint-3`. Testes: `npm run teste` passa de 242 para **320** critérios, todos passando (os 78 novos ficam em `backend/testes/sprint4.js`). Notas: US20 13 + US24 8 + US15 5 + US21 3 + US14 3 + US16 3 = **35 pontos**.

### Decisões tomadas com a Duda (levar ao grupo)

1. **A taxa vale só sobre o valor do serviço.** O deslocamento é gasto do prestador e vai inteiro para ele. Exemplo: R$ 200 de serviço + R$ 20 de deslocamento = R$ 220 pagos; taxa 8% × 200 = R$ 16; prestador recebe 220 − 16 = R$ 204.
2. **Botão "Cheguei" para a regra 50/50.** O prestador avisa que chegou; a partir daí, o cancelamento do cliente divide o valor ao meio. Cheguei e Iniciar só funcionam a partir de 1 hora antes do horário combinado (para ninguém "chegar" dias antes nem iniciar cedo e impedir o cancelamento).
3. **Média da US24 segue o card** (corrigido em 16/11): as avaliações dos 10 serviços mais recentes valem 2 e as mais antigas valem 1. Com 10 avaliações ou menos, dá o mesmo que a média simples.
4. **Prazo para avaliar: 7 dias** depois da confirmação. Vencido, a avaliação que existir é publicada sozinha.
5. **Reagendamento: até 3 por serviço, proposto por qualquer uma das partes.**
6. **"Iniciar serviço" entra na US20.** A máquina de estados exige Aceito → Em execução, e nenhum card tinha esse botão.
7. **Pedido com categoria.** Para o filtro da US16 funcionar, o pedido (US10) passa a guardar a categoria (opcional; vem do filtro da busca ou do "chamar de novo").

### Textos dos cards que precisam mudar no Word

| Card | Hoje no Word | Como fica |
|---|---|---|
| US20 | "Criar rotina de confirmação automática após o prazo" | "...após **72 horas** sem manifestação do contratante". Acrescentar no "O que será feito": "Criar ação do prestador para **iniciar** o serviço (Aceito → Em execução)" e "Conferir, antes do repasse, se a chave Pix é do CPF do cadastro". |
| US21 | "Implementar a regra de 8%..." | Acrescentar: "A taxa incide **só sobre o valor do serviço**; a taxa de deslocamento vai inteira para o prestador." |
| US15 | "Aplicar a regra de estorno conforme a antecedência definida no escopo" | Escrever a tabela: mais de 24 h = 100/0; menos de 24 h = 70/30; prestador no local (botão Cheguei) = 50/50; prestador cancela = 100/0. Critério novo: "Com o serviço em execução não existe cancelamento, só disputa." |
| US14 | "Limitar a quantidade de reagendamentos por serviço" | "...a **3** reagendamentos por serviço". História: "Como prestador **ou contratante**..." |
| US24 | "Calcular a média com peso maior para os últimos 10 serviços" | "...com **peso 2** para os últimos 10 serviços e **peso 1** para os anteriores". "Liberar as avaliações após ambas serem enviadas ou vencer o prazo **de 7 dias** após a confirmação". |
| US16 | "Permitir filtrar o histórico por categoria" | Sem mudança no card; registrar que o pedido (US10) passou a guardar a categoria. |

### O que mudou

**Banco** (criado sozinho ao subir a API):
- Tabelas novas: `reagendamentos` (US14), `avaliacoes` (US24, uma por pessoa e serviço) e `historico_servicos` (cada passo do serviço, com quem fez e quando).
- Colunas novas em `servicos`: `categoria_id`, `chegou_em`, `iniciado_em`, `concluido_em`, `confirmado_em`, `confirmacao_automatica`, `pago_em`, `cancelado_em`, `cancelado_por_id`, `cancelado_papel`, `motivo_cancelamento`, `regra_cancelamento`.
- Colunas novas em `pagamentos`: `taxa_percentual`, `taxa_valor`, `valor_repasse`, `repasse_id`, `liberado_em`, `repasse_pendente`, `valor_estorno`, `estorno_id`, `estornado_em`.
- `prestadores.total_avaliacoes`.

**Back-end**
- `servicos/repasse.js` (US20/US21): confirmar, calcular a taxa, conferir a chave e transferir; rotina de 5 em 5 minutos (72 horas, repasses pendentes, avaliações vencidas).
- `servicos/taxa.js` (US21): faixas 8/6/5, contagem de concluídos (Confirmado e Pago; cancelado e em disputa não contam) e a faixa para o painel.
- `servicos/cancelamento.js` (US15): prévia e cancelamento; estorno primeiro (se o banco recusar, nada muda); multa sem taxa para o prestador.
- `servicos/avaliacoes.js` (US24): publicação, média com peso (2 para os últimos 10 serviços) e regra das 5 avaliações.
- `controllers/execucaoController.js`: Cheguei, iniciar, concluir, confirmar, prévia e cancelamento, propor e responder nova data.
- `controllers/avaliacaoController.js`: avaliar, editar, responder e a lista pública de cada prestador.
- `servicoController.historico` (US16) e o detalhe do serviço com reagendamentos, histórico e avaliações.
- Gateway: `transferirPix` (Asaas `POST /transfers`) e `estornarCobranca` (Asaas `POST /payments/{id}/refund`), também no simulado.
- `GET /conta` traz quantos serviços a pessoa cancelou (US15: "contabilizar no histórico do usuário").

**Front-end**: `componentes/AndamentoServico.jsx` (+ `andamento.css`) na página do serviço; `paginas/Historico.jsx` ("Quem já me atendeu"); avaliações no cartão da busca; "Sua taxa no Fechô" no Meu perfil; grupo "Para você confirmar" em Meus serviços.

**Teste antigo ajustado**: o critério de ordenação da US09 agora grava 5 avaliações junto com a nota, porque a nota só ordena a busca a partir de 5 (US24).

**Demonstração** (`npm run db:demo -- --recriar`): a nota média e a conclusão deixam de ser simuladas. Ver a lista de contas no fim do comando e no checklist.

### O que ainda não existe (Sprint 5)

- Abrir disputa (US23) e a decisão do administrador (US25). Hoje, com o serviço em execução, o cancelamento é recusado com a mensagem de que a saída é a disputa.
- Punição na busca do prestador que cancela (regra decidida, mas não está em nenhum card desta sprint): o cancelamento já fica contado.
- Repasse e estorno no Asaas de verdade: o código segue a documentação, mas só foi testado no modo simulado.

### Como conferir

1. `npm run teste` → 325 critérios, 0 falhas (320 da entrega de 03/11 + 5 dos ajustes de 16/11).
2. `Checklist Sprint 4 Fechô.md`: cada item do "O que será feito" e cada critério dos 6 cards, com o teste e o passo na tela.

### Ajustes de 16/11 (conferência card por card)

| O que | Card | Por quê | Teste novo |
|---|---|---|---|
| Média com peso: as avaliações dos 10 serviços mais recentes valem 2, as anteriores valem 1 | US24 | O card pede "peso maior para os últimos 10 serviços"; a entrega de 03/11 usava a média simples | "a media da peso maior para os ultimos 10 servicos" (10 notas 5 recentes e 2 notas 1 antigas: (10 × 5 × 2 + 2 × 1 × 1) ÷ 22 = **4,64**; a simples daria 52 ÷ 12 = 4,33) e "a ordem vale pela data do servico" (10 notas 1 recentes e 2 notas 5 antigas: 30 ÷ 22 = **1,36**) |
| Comprovante do pagamento na tela do serviço: Pix pago, taxa e valor recebido (prestador), situação (cliente), valor devolvido e parte do profissional no cancelamento, data, código da transferência ou da devolução e banco | US20 ("o valor da taxa fica registrado e consultável por serviço") e US15 ("atualizar o status do pagamento") | No modo simulado, o repasse e o estorno só apareciam no console do servidor | "comprovante do prestador...", "comprovante do cliente..." (sem chave Pix nem taxa) e "comprovante do estorno..." |

Na API, o pagamento do detalhe do serviço ganhou `transferencia` (código e data), `estorno.id`, `gateway` e, só para o prestador, `repasse.chave` (mascarada, como na US06). Nada muda no banco.

### Teste no Asaas sandbox (16/11)

Para mostrar no painel do Asaas o que a US15 ("disparar o estorno **no gateway**") e a US20 ("disparar a transferência") pedem. Passo a passo no `GUIA-TESTE-ASAAS.md`.

- **Transferência no sandbox:** um CPF inventado não existe como chave Pix no sandbox. No modo `asaas`, o repasse vai para a chave de homologação do Banco Central `cliente-a00001@pix.bcb.gov.br` (debita o saldo, não credita ninguém). A conferência do CPF da chave (US06 / US20) continua acontecendo antes, no Fechô. `ASAAS_CHAVE_PIX_TESTE=cpf` volta a mandar para o CPF do prestador.
- **`npm run asaas:saldo`:** cria uma cobrança de teste de R$ 1.000 e marca como paga no sandbox. A transferência e o estorno saem do saldo da conta.
- Teste novo: "no Asaas sandbox, o repasse vai para a chave de teste do Banco Central". `npm run teste`: **326 critérios**, 0 falhas.


---

## Sprint 5 (final): US23, US25, US19 e US22

Branch: `Sprint-final` (criada a partir do estado da `Sprint-4`). Com estes quatro cards, as 25 histórias do backlog e o curinga US26 estão entregues. Cada critério, com o teste e o passo na tela, está no `Checklist Sprint 5 Fechô.md`.

### US23 - Abertura de disputa

| No cartão | Onde está |
|---|---|
| Tabela Disputas com justificativa e evidências | `models/Disputa.js` (uma por serviço; fotos sem GPS na pasta privada) e `POST /api/servicos/:id/disputa` |
| Abertura até 72 h após concluído | `servicos/disputas.js` (`motivoParaNaoAbrir`): Em execução, ou Concluído há no máximo `CONFIRMACAO_HORAS` (72) |
| Congelar o valor | o serviço vai para `em_disputa` (troca atômica); o pagamento segue `retido` |
| Defesa do prestador | `POST /api/servicos/:id/disputa/defesa` (texto + até 3 fotos, uma vez) |

### US25 - Painel do administrador

| No cartão | Onde está |
|---|---|
| Fila de disputas com evidências | `GET /api/admin/disputas` e `/admin/disputas/:id` (evidências das duas partes, chat, fotos do pedido, histórico, pagamentos e ficha de cada parte) |
| Decisões devolver / liberar / dividir com justificativa | `POST /api/admin/disputas/:id/decisao`; `servicos/disputas.js` (`decidir`) chama o estorno ou a transferência no gateway |
| Suspensão preventiva | `PATCH /api/admin/prestadores/:id/suspensao` (status `suspenso`, motivo visível ao próprio prestador) |
| Relatório | `GET /api/admin/relatorio?de=&ate=` |
| Registro das decisões | tabela `acoes_administrador` e `GET /api/admin/acoes` |

O perfil `administrador` entrou em `usuarios.tipo_perfil`. Ninguém vira administrador pelo cadastro do site: a conta é criada por `npm run admin:criar -- --email ... --senha ...`.

### US19 - Proposta complementar

| No cartão | Onde está |
|---|---|
| Justificativa e foto obrigatórias | `POST /api/servicos/:id/complementar` (multipart `valor`, `justificativa`, `foto`) |
| Máx. 50% do original e uma por serviço | `servicos/complementar.js` (sobre o valor do serviço, sem o deslocamento); índice único em `propostas_complementares.servico_id` |
| Pix adicional retido após aceite | `POST .../complementar/aceitar` gera um `Pagamento` com `tipo = 'complementar'`; o webhook o deixa `retido` junto com o original; a confirmação (US20) repassa os dois com a mesma taxa |
| Métrica no perfil | `complementares: { servicos, propostas, percentual }` na busca e em Meu perfil |

**Pagamento principal e complementar.** `Pagamento` ganhou a coluna `tipo` e um escopo padrão que traz só o principal. Assim, todo o fluxo das sprints anteriores (aceite, cancelamento, tela do serviço) continua olhando o pagamento do orçamento sem mudança. Quem precisa dos dois usa `Pagamento.unscoped()`: webhook, repasse, disputa, extrato e pendências.

### US22 - Extrato do prestador

| No cartão | Onde está |
|---|---|
| Extrato com filtro por período | `GET /api/prestadores/extrato?de=AAAA-MM-DD&ate=AAAA-MM-DD` (horário de Brasília; vale a data do repasse) |
| Bruto, taxa e líquido por serviço | `controllers/extratoController.js`: uma linha por serviço (o complementar soma na mesma linha) |
| Totais e retidos | `totais` é a soma das linhas; `retidos` traz o que ainda está congelado, fora dos totais |
| Exportar | `GET /api/prestadores/extrato.csv` (separador `;`, vírgula decimal, BOM para o Excel) |

### Decisões tomadas onde o cartão não dizia (confirmar com o grupo)

| Decisão | Por quê |
|---|---|
| Só o contratante abre disputa; o prestador se defende | O cartão fala em "defesa do prestador" e em "o contratante não estorna sozinho" |
| A disputa também abre com o serviço Em execução | No Sprint 4 o cancelamento ficou bloqueado em execução com a mensagem "a saída é abrir uma disputa" |
| Prazo de 72 h = o mesmo `CONFIRMACAO_HORAS` da US20 | Depois dele o serviço já foi confirmado e o dinheiro liberado; os dois prazos andam juntos |
| O admin decide depois da defesa ou de 48 h sem defesa | Sem isso, "o prestador responde" poderia ser atropelado pela decisão |
| Dividir não paga taxa; liberar paga a taxa normal | Igual ao Sprint 4: multa de cancelamento sem taxa, conclusão com taxa |
| Serviço decidido fica `resolvido` e não conta para a faixa de taxa (US21) | O cartão da US21 diz que serviço em disputa não conta |
| Complementar só no local (Em execução, ou Aceito depois do Cheguei) | O trabalho a mais é descoberto no atendimento |
| Complementar retido volta inteiro no cancelamento | O trabalho a mais não foi feito; o original segue a regra da US15 |
| Proposta sem pagamento perde o efeito quando o serviço é concluído, cancelado ou vai para disputa | Evita Pix adicional pago depois de o serviço acabar |
| Métrica = propostas ÷ serviços aceitos | Mostra com que frequência o profissional pede a mais |
| Extrato: retidos mostram a situação de agora, sem o filtro de período | Dinheiro congelado ainda não tem data de repasse |
| Mídias de disputa aberta não são apagadas pela rotina dos 90 dias | São a prova da decisão |

### Banco de dados

As tabelas novas (`disputas`, `propostas_complementares`, `acoes_administrador`) são criadas pelo `sequelize.sync()`. As colunas novas (`pagamentos.tipo`, `prestadores.suspenso_em`, `prestadores.motivo_suspensao`) entram sozinhas pelo `garantirColunas`, que agora também acrescenta valores novos de ENUM no MySQL (`usuarios.tipo_perfil` ganhou `administrador`). Ou seja: **basta reiniciar a API**. O `schema.sql` foi gerado de novo a partir dos modelos (ele estava parado no Sprint 2).

### Testes

`npm run teste`: **409 critérios, 0 falhas** (eram 326). São 83 novos em `testes/sprint5.js`: 25 da US23, 27 da US25, 21 da US19 e 10 da US22. Antes de entregar, três regras foram desligadas uma de cada vez (limite de 50%, prazo de 72 h, bloqueio da confirmação automática) e os testes correspondentes falharam. O build do front compila sem erros, e as telas foram conferidas no navegador com os dados de demonstração, no computador e no celular.

### Demonstração

`npm run db:demo -- --recriar` agora também cria (arquivo `src/database/demo-sprint5.js`): a conta `admin.demo@fecho.app`, uma disputa aberta com defesa e fotos para decidir ao vivo, um serviço concluído há 2 horas para abrir disputa ao vivo, uma proposta complementar esperando aceite, um serviço pago com complementar e uma disputa já decidida (para o relatório e o registro). As fotos são PNGs gerados pelo script. `npm run pix:pagar` também paga o Pix complementar.

### Arquivos

- Backend novos: `models/Disputa.js`, `models/PropostaComplementar.js`, `models/AcaoAdministrador.js`, `servicos/disputas.js`, `servicos/complementar.js`, `controllers/disputaController.js`, `controllers/adminController.js`, `controllers/extratoController.js`, `database/demo-sprint5.js`, `scripts/admin-criar.js`, `testes/sprint5.js`
- Backend alterados: `models/Pagamento.js`, `Prestador.js`, `Servico.js`, `Usuario.js`, `index.js`, `servicos/repasse.js`, `cobrancas.js`, `cancelamento.js`, `pendencias.js`, `retencaoMidias.js`, `controllers/servicoController.js`, `execucaoController.js`, `prestadorController.js`, `routes/index.js`, `database/colunas.js`, `database/demo.js`, `scripts/pix-pagar.js`, `testes/criterios.js`, `schema.sql`, `package.json`
- Frontend novos: `componentes/DisputaComplementar.jsx` e `.css`, `paginas/Extrato.jsx` e `extrato.css`, `paginas/Admin.jsx`, `paginas/AdminDisputa.jsx` e `admin.css`
- Frontend alterados: `App.jsx`, `servicos/api.js`, `componentes/Cabecalho.jsx`, `ImagemProtegida.jsx`, `paginas/Entrar.jsx`, `MeuPerfil.jsx`, `Prestadores.jsx`, `ServicoDetalhe.jsx`, `Servicos.jsx`, `servicos.css`

### Em aberto

- **Notas do Planning Poker** dos quatro cards.
- **Decisões acima**, principalmente as 48 h de defesa e o "dividir sem taxa".
