require('dotenv').config();
const app = require('./app');
const { sequelize } = require('./models');
const { iniciarRotinaRetencao } = require('./servicos/retencao');
const { iniciarRotinaLembretes } = require('./servicos/lembretes');
const { iniciarRotinaRetencaoMidias } = require('./servicos/retencaoMidias');
const { iniciarRotinaCobrancas } = require('./servicos/cobrancas');
const { garantirColunas } = require('./database/colunas');
const { nomeGateway, avisosDeConfiguracao } = require('./servicos/gateway');

const porta = Number(process.env.PORT || 3333);

async function iniciar() {
  try {
    await sequelize.authenticate();
    // Em desenvolvimento o sync cria as tabelas novas e garantirColunas
    // acrescenta as colunas novas nas que ja existem (sem apagar nada).
    await sequelize.sync();
    const criadas = await garantirColunas(sequelize);
    if (criadas.length) console.log('[banco] colunas novas:', criadas.join(', '));
    app.listen(porta, () => {
      console.log(`API do Fecho rodando em http://localhost:${porta}`);
      console.log(`[pagamento] gateway: ${nomeGateway()}`);
      avisosDeConfiguracao().forEach((aviso) => console.warn(`[pagamento] ${aviso}`));
    });
    iniciarRotinaRetencao();
    iniciarRotinaLembretes(); // US13
    iniciarRotinaRetencaoMidias(); // US12
    iniciarRotinaCobrancas(); // US17
  } catch (e) {
    console.error('Nao consegui conectar no banco:', e.message);
    process.exit(1);
  }
}

iniciar();
