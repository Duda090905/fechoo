/**
 * Acrescenta nas tabelas que ja existem as colunas novas dos modelos.
 *
 * O sequelize.sync() cria tabela nova, mas nao adiciona coluna em tabela que
 * ja existe. E o sync({ alter: true }) mexe em tudo (e duplica indice unico a
 * cada vez que roda). Esta funcao faz so o necessario: para cada modelo, olha
 * as colunas que o banco tem e cria as que faltam. Nunca apaga nem altera
 * nada que ja esta la, entao pode rodar a cada vez que a API sobe.
 *
 * Sprint 3: servicos.endereco, servicos.aceito_em, usuarios.asaas_cliente_id,
 * prestadores.chave_pix_tipo, prestadores.chave_pix, prestadores.verificado_em.
 */
async function garantirColunas(sequelize) {
  const fila = sequelize.getQueryInterface();
  const criadas = [];

  for (const modelo of Object.values(sequelize.models)) {
    const tabela = modelo.getTableName();
    let existentes;
    try {
      existentes = await fila.describeTable(tabela);
    } catch {
      continue; // tabela nova: o sync() cria inteira
    }
    for (const [nome, atributo] of Object.entries(modelo.rawAttributes)) {
      const coluna = atributo.field || nome;
      if (existentes[coluna]) continue;
      // Coluna nova sempre entra aceitando nulo, para nao quebrar as linhas
      // que ja existem; o modelo cuida do valor dali em diante.
      await fila.addColumn(tabela, coluna, {
        type: atributo.type,
        allowNull: true,
        defaultValue: atributo.defaultValue
      });
      criadas.push(`${tabela}.${coluna}`);
    }
  }
  return criadas;
}

module.exports = { garantirColunas };
