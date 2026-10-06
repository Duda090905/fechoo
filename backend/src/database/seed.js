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

// Bairros de exemplo; a lista oficial entra em outro momento.
const BAIRROS = [
  'Barao Geraldo', 'Cambui', 'Centro', 'Bosque', 'Botafogo', 'Guanabara',
  'Taquaral', 'Jardim Chapadao', 'Mansoes Santo Antonio', 'Nova Campinas',
  'Jardim Guanabara', 'Vila Industrial', 'Jardim do Lago', 'Ponte Preta',
  'Swift', 'Jardim Proenca', 'Sousas', 'Joaquim Egidio', 'Campo Grande',
  'Jardim Eulina', 'Vila Uniao', 'Parque Prado', 'Jardim Nova Europa',
  'Cidade Universitaria', 'Vila Nova'
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

  for (const nome of BAIRROS) {
    await Bairro.findOrCreate({ where: { nome, cidade: 'Campinas' }, defaults: { nome, cidade: 'Campinas' } });
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
