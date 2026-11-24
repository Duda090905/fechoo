/**
 * US25 - cria (ou atualiza a senha de) uma conta de administrador.
 *
 * O administrador nao se cadastra pelo site: a tela de cadastro so aceita
 * contratante e prestador. Uso:
 *
 *   npm run admin:criar -- --nome "Equipe Fechô" --email admin@fecho.app --senha "umaSenhaForte1"
 */
require('dotenv').config();
const { sequelize, Usuario } = require('../src/models');
const { garantirColunas } = require('../src/database/colunas');
const { gerarHash, senhaForte } = require('../src/utils/senha');
const { normalizarEmail, emailValido } = require('../src/utils/contato');

function argumento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function principal() {
  const nome = String(argumento('nome') || 'Administração Fechô').trim();
  const email = normalizarEmail(argumento('email'));
  const senha = argumento('senha');
  if (!emailValido(email)) throw new Error('Informe um e-mail válido com --email.');
  if (!senha || !senhaForte(senha)) throw new Error('Informe com --senha uma senha de 8 caracteres ou mais, com letra e número.');

  await sequelize.authenticate();
  await sequelize.sync();
  await garantirColunas(sequelize);

  const existente = await Usuario.findOne({ where: { email } });
  if (existente && existente.tipo_perfil !== 'administrador') {
    throw new Error('Esse e-mail já é de uma conta de cliente ou profissional. Use outro e-mail.');
  }
  const senhaHash = await gerarHash(senha);
  if (existente) {
    existente.nome = nome;
    existente.senha_hash = senhaHash;
    existente.status = 'ativo';
    existente.token_versao = (existente.token_versao || 0) + 1;
    await existente.save();
    console.log(`Administrador atualizado: ${email}`);
  } else {
    await Usuario.create({
      nome, email, senha_hash: senhaHash, tipo_perfil: 'administrador', status: 'ativo',
      aceite_termos: true, aceite_termos_em: new Date()
    });
    console.log(`Administrador criado: ${email}`);
  }
}

principal()
  .then(() => sequelize.close())
  .catch(async (e) => {
    console.error(e.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
