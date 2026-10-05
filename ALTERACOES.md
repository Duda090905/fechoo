# Registro de alterações

Branch: `Alterações-(correções-sprint-1)`

Este arquivo lista o que foi mudado em cada etapa, por quê, e como conferir.
A numeração dos itens segue a lista combinada na análise do Sprint 1.

| Fase | Itens | Situação |
|---|---|---|
| 1. Busca e perfil (US05) | 1, 2 e testes | Concluída |
| 2. Sessão (US02/US03) | 4, 5, 12 e testes de recuperação | Concluída |
| 3. Cadastro e perfil no front (US01/US05) | 3, 9, 6 | Pendente |
| 4. Prioridade média | 7, 8, 10, 11 | Pendente |
| 5. Endurecimento | 13, 14, restante do 15 | Pendente |

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