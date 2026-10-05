# Registro de alterações

Branch: `Alterações-(correções-sprint-1)`

Este arquivo lista o que foi mudado em cada etapa, por quê, e como conferir.
A numeração dos itens segue a lista combinada na análise do Sprint 1.

| Fase | Itens | Situação |
|---|---|---|
| 1. Busca e perfil (US05) | 1, 2 e testes | Concluída |
| 2. Sessão (US02/US03) | 4, 5, 12 | Pendente |
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
