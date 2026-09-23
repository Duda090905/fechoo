/**
 * Carga inicial: areas, categorias e bairros.
 *
 * ATENCAO: a lista de 17 categorias em 6 areas abaixo e uma PROPOSTA.
 * Trocar pelos nomes exatos definidos no escopo do grupo antes de entregar.
 * Basta editar este arquivo e rodar de novo: npm run db:seed
 */
require('dotenv').config();
const { sequelize, Area, Categoria, Bairro } = require('../models');

const CATALOGO = [
  { area: 'Reparos e manutencao', categorias: ['Eletricista', 'Encanador', 'Pedreiro', 'Marido de aluguel'] },
  { area: 'Casa e limpeza', categorias: ['Diarista', 'Passadeira', 'Limpeza pos-obra'] },
  { area: 'Montagem e transporte', categorias: ['Montador de moveis', 'Frete e mudanca', 'Chaveiro'] },
  { area: 'Acabamento', categorias: ['Pintor', 'Gesseiro', 'Vidraceiro'] },
  { area: 'Clima e eletro', categorias: ['Ar-condicionado', 'Conserto de eletrodomesticos'] },
  { area: 'Area externa', categorias: ['Jardinagem', 'Dedetizacao'] }
];

const BAIRROS = [
  ['Barao Geraldo', 'Norte'], ['Cambui', 'Central'], ['Centro', 'Central'],
  ['Bosque', 'Central'], ['Botafogo', 'Central'], ['Guanabara', 'Central'],
  ['Taquaral', 'Norte'], ['Jardim Chapadao', 'Norte'], ['Mansoes Santo Antonio', 'Sul'],
  ['Nova Campinas', 'Sul'], ['Jardim Guanabara', 'Norte'], ['Vila Industrial', 'Leste'],
  ['Jardim do Lago', 'Sul'], ['Ponte Preta', 'Sul'], ['Swift', 'Sul'],
  ['Jardim Proenca', 'Norte'], ['Sousas', 'Leste'], ['Joaquim Egidio', 'Leste'],
  ['Campo Grande', 'Oeste'], ['Jardim Eulina', 'Oeste'], ['Vila Uniao', 'Oeste'],
  ['Parque Prado', 'Sul'], ['Jardim Nova Europa', 'Leste'], ['Cidade Universitaria', 'Norte'],
  ['Vila Nova', 'Central']
];

async function rodar() {
  await sequelize.sync();

  for (let i = 0; i < CATALOGO.length; i += 1) {
    const bloco = CATALOGO[i];
    const [area] = await Area.findOrCreate({
      where: { nome: bloco.area },
      defaults: { nome: bloco.area, ordem: i + 1 }
    });
    for (const nome of bloco.categorias) {
      await Categoria.findOrCreate({ where: { nome }, defaults: { nome, area_id: area.id } });
    }
  }

  for (const [nome, regiao] of BAIRROS) {
    await Bairro.findOrCreate({ where: { nome, cidade: 'Campinas' }, defaults: { nome, cidade: 'Campinas', regiao } });
  }

  const totalCategorias = await Categoria.count();
  const totalBairros = await Bairro.count();
  console.log(`Carga concluida: ${CATALOGO.length} areas, ${totalCategorias} categorias, ${totalBairros} bairros.`);
  await sequelize.close();
}

rodar().catch((e) => {
  console.error('Falha na carga inicial:', e.message);
  process.exit(1);
});
