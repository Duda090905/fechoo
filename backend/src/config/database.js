require('dotenv').config();
const { Sequelize } = require('sequelize');

// O projeto roda em MySQL. O dialeto sqlite existe para o teste automatizado
// (npm run teste), que sobe um banco em memoria. DB_STORAGE e opcional: com
// DB_DIALECT=sqlite, aponta para um arquivo em vez da memoria.
const dialeto = process.env.DB_DIALECT || 'mysql';

const sequelize = dialeto === 'sqlite'
  ? new Sequelize({
    dialect: 'sqlite',
    storage: process.env.DB_STORAGE || ':memory:',
    logging: false,
    define: { underscored: true, freezeTableName: true }
  })
  : new Sequelize(
    process.env.DB_NAME || 'fecho',
    process.env.DB_USER || 'root',
    process.env.DB_PASS || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      dialect: 'mysql',
      logging: false,
      define: { underscored: true, freezeTableName: true }
    }
  );

module.exports = sequelize;
