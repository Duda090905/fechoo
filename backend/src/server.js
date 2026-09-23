require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');

const porta = Number(process.env.PORT || 3333);

async function iniciar() {
  try {
    await sequelize.authenticate();
    // Em desenvolvimento o sync cria e ajusta as tabelas.
    await sequelize.sync();
    app.listen(porta, () => console.log(`API do Fecho rodando em http://localhost:${porta}`));
  } catch (e) {
    console.error('Nao consegui conectar no banco:', e.message);
    process.exit(1);
  }
}

iniciar();
