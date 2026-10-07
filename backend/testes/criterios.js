/**
 * Verificacao dos criterios de aceite do Sprint 1 e do Sprint 2.
 * Sobe a API em memoria (sqlite) e chama os endpoints de verdade.
 *
 * Rodar com: npm run teste
 */
process.env.DB_DIALECT = 'sqlite';
process.env.JWT_SECRET = 'chave-de-teste';
// Fotos de teste vao para uma pasta temporaria, nunca para backend/uploads.
process.env.UPLOADS_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'fecho-uploads-'));

const {
  sequelize, Area, Categoria, Bairro, Prestador, Pausa, SolicitacaoExclusao, Servico, Mensagem
} = require('../src/models');
const app = require('../src/app');
const { processarLembretes } = require('../src/servicos/lembretes');
const { processarRetencaoMidias } = require('../src/servicos/retencaoMidias');

let base;
let passou = 0;
let falhou = 0;

function checar(descricao, condicao) {
  if (condicao) {
    passou += 1;
    console.log(`  ok   ${descricao}`);
  } else {
    falhou += 1;
    console.log(`  FALHA ${descricao}`);
  }
}

async function chamar(caminho, { metodo = 'GET', corpo, token } = {}) {
  const cabecalhos = { 'Content-Type': 'application/json' };
  if (token) cabecalhos.Authorization = `Bearer ${token}`;
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo, headers: cabecalhos, body: corpo ? JSON.stringify(corpo) : undefined
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
}

// Envia o campo "foto" como formulario multipart (sem bytes = formulario vazio).
async function enviarFoto(token, bytes, { nome = 'foto.png', tipo = 'image/png' } = {}) {
  const form = new FormData();
  if (bytes) form.append('foto', new Blob([bytes], { type: tipo }), nome);
  const resposta = await fetch(`${base}/prestadores/foto`, {
    method: 'PUT', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
}

// Abre um arquivo servido pela API (fora do prefixo /api).
function buscarArquivo(caminho) {
  return fetch(`${base.replace(/\/api$/, '')}${caminho}`);
}

// Formulario multipart com campos de texto e arquivos (Sprint 2).
async function chamarForm(caminho, { metodo = 'POST', campos = {}, arquivos = [], token } = {}) {
  const form = new FormData();
  Object.entries(campos).forEach(([chave, valor]) => form.append(chave, String(valor)));
  arquivos.forEach(({ campo, bytes, nome = 'foto.png', tipo = 'image/png' }) => {
    form.append(campo, new Blob([bytes], { type: tipo }), nome);
  });
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form
  });
  return { status: resposta.status, dados: await resposta.json().catch(() => ({})) };
}

// Baixa um arquivo protegido da API, com login.
async function baixar(caminho, token) {
  const resposta = await fetch(`${base}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const bytes = Buffer.from(await resposta.arrayBuffer());
  return { status: resposta.status, tipo: resposta.headers.get('content-type'), bytes };
}

// Captura o que uma funcao escreve no console (e-mails sem SMTP).
async function capturarConsole(funcao) {
  const original = console.log;
  const linhas = [];
  console.log = (...args) => linhas.push(args.join(' '));
  try {
    const resultado = await funcao();
    return { resultado, linhas };
  } finally {
    console.log = original;
  }
}

const CONTRATANTE = {
  nome: 'Ana Souza', cpf: '52998224725', email: 'ana@teste.com',
  telefone: '19999990000', senha: 'senha1234', tipo_perfil: 'contratante', sexo: 'feminino', aceite_termos: true
};
const PRESTADORA = {
  nome: 'Rita Lima', cpf: '11144477735', email: 'rita@teste.com',
  telefone: '19999990000', senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
};
const PRESTADOR = {
  nome: 'Joao Alves', cpf: '15350946056', email: 'joao@teste.com',
  telefone: '19999990000', senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'masculino', aceite_termos: true
};

async function rodar() {
  await sequelize.sync({ force: true });

  const area = await Area.create({ nome: 'Reparos', ordem: 1 });
  const categorias = await Categoria.bulkCreate([
    { nome: 'Eletricista', area_id: area.id }, { nome: 'Encanador', area_id: area.id },
    { nome: 'Pintor', area_id: area.id }, { nome: 'Diarista', area_id: area.id },
    { nome: 'Chaveiro', area_id: area.id }, { nome: 'Jardinagem', area_id: area.id }
  ]);
  const bairro = await Bairro.create({ nome: 'Cambui', cidade: 'Campinas' });
  const idsCategorias = categorias.map((c) => c.id);

  const servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}/api`;

  console.log('\nUS01 - Cadastro');
  const cadastro = await chamar('/auth/register', { metodo: 'POST', corpo: CONTRATANTE });
  checar('cria conta e devolve token', cadastro.status === 201 && Boolean(cadastro.dados.token));
  checar('nao devolve senha nem CPF na resposta',
    !('senha_hash' in cadastro.dados.usuario) && !('cpf' in cadastro.dados.usuario));

  const repetido = await chamar('/auth/register', { metodo: 'POST', corpo: CONTRATANTE });
  checar('recusa e-mail ja cadastrado', repetido.status === 409);

  const cpfRuim = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'outro@teste.com', cpf: '11111111111' }
  });
  checar('recusa CPF invalido', cpfRuim.status === 400);

  const senhaFraca = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'fraca@teste.com', cpf: '15350946056', senha: '123' }
  });
  checar('recusa senha fraca', senhaFraca.status === 400);

  const emailRuim = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'isso-nao-e-email', cpf: '71428793860' }
  });
  checar('recusa e-mail com formato invalido', emailRuim.status === 400);

  const telefoneRuim = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'tel@teste.com', cpf: '71428793860', telefone: '123' }
  });
  checar('recusa telefone com quantidade de digitos invalida', telefoneRuim.status === 400);

  const { telefone: _omitido, ...semTelefoneCorpo } = CONTRATANTE;
  const semTelefone = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...semTelefoneCorpo, email: 'semtel@teste.com', cpf: '71428793860' }
  });
  checar('recusa cadastro sem telefone', semTelefone.status === 400);

  const telefoneVazio = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'telvazio@teste.com', cpf: '71428793860', telefone: '  ' }
  });
  checar('recusa cadastro com telefone em branco', telefoneVazio.status === 400);

  const emailMaiusculo = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'ANA@TESTE.COM', cpf: '71428793860' }
  });
  checar('e-mail repetido com letras maiusculas tambem e recusado', emailMaiusculo.status === 409);

  const DANI = {
    nome: '  Dani Rocha  ', cpf: '453.178.287-91', email: '  Dani@Teste.COM ',
    telefone: '(19) 99876-5432', senha: 'senha1234', tipo_perfil: 'contratante', aceite_termos: true
  };
  const cadDani = await chamar('/auth/register', { metodo: 'POST', corpo: DANI });
  checar('cadastra com CPF mascarado, e-mail com espacos e maiusculas',
    cadDani.status === 201 && cadDani.dados.usuario.email === 'dani@teste.com');
  checar('nome e telefone sao guardados limpos',
    cadDani.dados.usuario.nome === 'Dani Rocha' && cadDani.dados.usuario.telefone === '19998765432');

  const loginDani = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: 'DANI@teste.com', senha: 'senha1234' }
  });
  checar('login nao diferencia maiusculas e minusculas no e-mail', loginDani.status === 200);

  const semTermo = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'termo@teste.com', cpf: '15350946056', aceite_termos: false }
  });
  checar('recusa cadastro sem aceite do termo (LGPD)', semTermo.status === 400);

  const { Usuario } = require('../src/models');
  const salvo = await Usuario.findOne({ where: { email: CONTRATANTE.email } });
  checar('senha gravada como hash, nunca em texto puro',
    salvo.senha_hash !== CONTRATANTE.senha && salvo.senha_hash.startsWith('$2'));

  console.log('\nUS02 - Login e acesso restrito');
  const login = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: CONTRATANTE.email, senha: CONTRATANTE.senha }
  });
  checar('login correto devolve token', login.status === 200 && Boolean(login.dados.token));
  const tokenAna = login.dados.token;

  const loginErrado = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: CONTRATANTE.email, senha: 'errada123' }
  });
  checar('senha errada devolve mensagem generica',
    loginErrado.status === 401 && !/senha incorreta$/i.test(loginErrado.dados.erro || ''));

  const semToken = await chamar('/conta');
  checar('rota protegida exige token', semToken.status === 401);

  const tokenFalso = await chamar('/conta', { token: 'token.invalido.aqui' });
  checar('token invalido e rejeitado', tokenFalso.status === 401);

  const comToken = await chamar('/conta', { token: tokenAna });
  checar('token valido acessa a propria conta', comToken.dados.usuario.email === CONTRATANTE.email);

  console.log('\nUS03 - Recuperacao de senha');
  const pedido = await chamar('/auth/esqueci-senha', { metodo: 'POST', corpo: { email: CONTRATANTE.email } });
  const inexistente = await chamar('/auth/esqueci-senha', { metodo: 'POST', corpo: { email: 'ninguem@teste.com' } });
  checar('resposta identica para e-mail existente e inexistente',
    pedido.dados.mensagem === inexistente.dados.mensagem);

  const tokenInvalido = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: 'inventado', senha: 'novasenha1' }
  });
  checar('token de recuperacao invalido e recusado', tokenInvalido.status === 400);

  // O link vai para o console quando nao ha SMTP; captura para usar o token de verdade.
  async function pedirLink(email) {
    const original = console.log;
    let link = null;
    console.log = (...args) => {
      const texto = args.join(' ');
      const achou = texto.match(/token=([0-9a-f]+)/);
      if (achou) link = achou[1];
    };
    try {
      await chamar('/auth/esqueci-senha', { metodo: 'POST', corpo: { email } });
    } finally {
      console.log = original;
    }
    return link;
  }

  const CARLA = {
    nome: 'Carla Dias', cpf: '16899535009', email: 'carla@teste.com',
    telefone: '19999990000', senha: 'senhaantiga1', tipo_perfil: 'contratante', aceite_termos: true
  };
  const cadCarla = await chamar('/auth/register', { metodo: 'POST', corpo: CARLA });
  const tokenCarlaAntigo = cadCarla.dados.token;

  const linkA = await pedirLink(CARLA.email);
  const linkB = await pedirLink(CARLA.email);
  checar('o pedido gera um token de uso no link', Boolean(linkA) && Boolean(linkB) && linkA !== linkB);

  const senhaFracaNoLink = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: linkB, senha: '123' }
  });
  checar('senha fraca na redefinicao e recusada sem gastar o link', senhaFracaNoLink.status === 400);

  const redefinicao = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: linkB, senha: 'senhanova1' }
  });
  checar('link valido redefine a senha', redefinicao.status === 200);

  const reuso = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: linkB, senha: 'outrasenha1' }
  });
  checar('link ja usado nao redefine de novo', reuso.status === 400);

  const outroLink = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: linkA, senha: 'outrasenha1' }
  });
  checar('outros links pendentes perdem a validade apos o uso', outroLink.status === 400);

  const { TokenSenha } = require('../src/models');
  const { hashDeToken } = require('../src/utils/token');
  const carlaNoBanco = await Usuario.findOne({ where: { email: CARLA.email } });
  await TokenSenha.create({
    usuario_id: carlaNoBanco.id, token_hash: hashDeToken('link-vencido'),
    expira_em: new Date(Date.now() - 60000)
  });
  const vencido = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: 'link-vencido', senha: 'outrasenha1' }
  });
  checar('link expirado nao redefine a senha', vencido.status === 400);

  const loginAntiga = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: CARLA.email, senha: CARLA.senha }
  });
  checar('apos redefinir, a senha antiga nao funciona mais', loginAntiga.status === 401);

  const loginNova = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: CARLA.email, senha: 'senhanova1' }
  });
  checar('apos redefinir, a senha nova funciona', loginNova.status === 200 && Boolean(loginNova.dados.token));

  const sessaoAntiga = await chamar('/conta', { token: tokenCarlaAntigo });
  checar('sessao aberta antes da redefinicao e encerrada', sessaoAntiga.status === 401);

  const sessaoNova = await chamar('/conta', { token: loginNova.dados.token });
  checar('sessao aberta depois da redefinicao funciona', sessaoNova.status === 200);

  console.log('\nUS05 - Perfil do prestador');
  const cadPrestadora = await chamar('/auth/register', { metodo: 'POST', corpo: PRESTADORA });
  const tokenRita = cadPrestadora.dados.token;
  const cadPrestador = await chamar('/auth/register', { metodo: 'POST', corpo: PRESTADOR });
  const tokenJoao = cadPrestador.dados.token;

  const contratanteNoPerfil = await chamar('/prestadores/meu-perfil', { token: tokenAna });
  checar('contratante nao acessa area de prestador', contratanteNoPerfil.status === 403);

  const seisCategorias = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita,
    corpo: { categorias: idsCategorias, bairros: [bairro.id] }
  });
  checar('impede selecionar a sexta categoria', seisCategorias.status === 400);

  const perfilRita = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita,
    corpo: { descricao: 'Faco instalacoes eletricas.', categorias: idsCategorias.slice(0, 2), bairros: [bairro.id] }
  });
  checar('salva perfil com ate 5 categorias', perfilRita.status === 200 && perfilRita.dados.prestador.categorias.length === 2);
  checar('a opcao "atendo apenas mulheres" nunca vem marcada por padrao (US08)',
    perfilRita.dados.prestador.atende_apenas_mulheres === false);

  await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenJoao,
    corpo: { descricao: 'Pinturas em geral.', categorias: [idsCategorias[2]], bairros: [bairro.id] }
  });

  console.log('\nUS05 - Validacao do perfil');
  const vazias = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { categorias: [] }
  });
  checar('recusa esvaziar as categorias', vazias.status === 400);

  const bairrosVazios = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { bairros: [] }
  });
  checar('recusa esvaziar os bairros', bairrosVazios.status === 400);

  const categoriaFantasma = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { categorias: [999999] }
  });
  checar('recusa categoria que nao existe, com mensagem clara',
    categoriaFantasma.status === 400 && /categoria/i.test(categoriaFantasma.dados.erro || ''));

  const bairroFantasma = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { bairros: [999999] }
  });
  checar('recusa bairro que nao existe, com mensagem clara',
    bairroFantasma.status === 400 && /bairro/i.test(bairroFantasma.dados.erro || ''));

  const aindaIntacto = await chamar('/prestadores/meu-perfil', { token: tokenRita });
  checar('perfil recusado nao altera o que estava salvo',
    aindaIntacto.dados.prestador.categorias.length === 2 && aindaIntacto.dados.prestador.bairros.length === 1);

  console.log('\nUS05 - Foto do perfil (upload)');
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

  const semArquivo = await enviarFoto(tokenRita, null);
  checar('recusa envio sem arquivo', semArquivo.status === 400);

  const falsoPng = await enviarFoto(tokenRita, Buffer.from('isto e um texto, nao uma imagem'), { nome: 'foto.png' });
  checar('recusa arquivo que finge ser imagem (confere o conteudo, nao o nome)', falsoPng.status === 400);

  const svg = await enviarFoto(tokenRita, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    { nome: 'foto.svg', tipo: 'image/svg+xml' });
  checar('recusa SVG (pode carregar script)', svg.status === 400);

  const grande = await enviarFoto(tokenRita, Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
  checar('recusa foto maior que 2 MB', grande.status === 413);

  const contratanteEnviando = await enviarFoto(tokenAna, PNG);
  checar('contratante nao envia foto de prestador', contratanteEnviando.status === 403);

  const semLogin = await enviarFoto(null, PNG);
  checar('envio exige login', semLogin.status === 401);

  const fotoPng = await enviarFoto(tokenRita, PNG);
  checar('aceita PNG e devolve o endereco da foto',
    fotoPng.status === 200 && /^\/uploads\/perfis\/[0-9a-f]{32}\.png$/.test(fotoPng.dados.foto_url || ''));

  const arquivoPng = await buscarArquivo(fotoPng.dados.foto_url);
  checar('a foto enviada pode ser aberta, como imagem',
    arquivoPng.status === 200 && arquivoPng.headers.get('content-type') === 'image/png');
  checar('a foto e servida com nosniff', arquivoPng.headers.get('x-content-type-options') === 'nosniff');

  const comFoto = await chamar('/prestadores/meu-perfil', { token: tokenRita });
  checar('o perfil passa a mostrar a foto', comFoto.dados.prestador.foto_url === fotoPng.dados.foto_url);

  const mantem = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { descricao: 'Outra descricao.' }
  });
  checar('salvar o perfil sem enviar foto nao apaga a foto', mantem.dados.prestador.foto_url === fotoPng.dados.foto_url);

  const ignoraLink = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenRita, corpo: { foto_url: 'https://exemplo.com/outra.jpg' }
  });
  checar('endereco externo de foto nao e mais aceito', ignoraLink.dados.prestador.foto_url === fotoPng.dados.foto_url);

  const fotoJpg = await enviarFoto(tokenRita, JPG, { nome: 'rita.jpg', tipo: 'image/jpeg' });
  checar('trocar por JPEG funciona', fotoJpg.status === 200 && fotoJpg.dados.foto_url.endsWith('.jpg'));

  const antigaSumiu = await buscarArquivo(fotoPng.dados.foto_url);
  checar('a foto antiga e apagada do disco ao trocar', antigaSumiu.status === 404);

  const remocao = await chamar('/prestadores/foto', { metodo: 'DELETE', token: tokenRita });
  checar('remover a foto limpa o perfil', remocao.status === 200);
  const semMais = await chamar('/prestadores/meu-perfil', { token: tokenRita });
  checar('perfil sem foto devolve nulo', semMais.dados.prestador.foto_url === null);
  checar('remover a foto apaga o arquivo do disco', (await buscarArquivo(fotoJpg.dados.foto_url)).status === 404);

  const removeDeNovo = await chamar('/prestadores/foto', { metodo: 'DELETE', token: tokenRita });
  checar('remover quando nao ha foto nao da erro', removeDeNovo.status === 200);

  // Prestadores incompletos: nao podem aparecer em nenhuma busca.
  const SEM_CATEGORIA = {
    nome: 'Paulo Sem Categoria', cpf: '39053344705', email: 'paulo@teste.com',
    telefone: '19999990000', senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'masculino', aceite_termos: true
  };
  const SEM_BAIRRO = {
    nome: 'Bia Sem Bairro', cpf: '86288366757', email: 'bia@teste.com',
    telefone: '19999990000', senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
  };
  const cadSemCategoria = await chamar('/auth/register', { metodo: 'POST', corpo: SEM_CATEGORIA });
  const cadSemBairro = await chamar('/auth/register', { metodo: 'POST', corpo: SEM_BAIRRO });

  const soBairro = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: cadSemCategoria.dados.token, corpo: { descricao: 'Ainda sem categoria.', bairros: [bairro.id] }
  });
  checar('permite salvar o perfil aos poucos (so bairro)', soBairro.status === 200);

  const repetidas = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: cadSemBairro.dados.token,
    corpo: { descricao: 'Ainda sem bairro.', categorias: Array(6).fill(idsCategorias[0]) }
  });
  checar('categoria repetida conta uma vez so, nao estoura o limite',
    repetidas.status === 200 && repetidas.dados.prestador.categorias.length === 1);

  const nomesSemFiltro = (await chamar('/prestadores')).dados.prestadores.map((p) => p.nome);
  checar('prestador sem categoria nao aparece na listagem', !nomesSemFiltro.includes(SEM_CATEGORIA.nome));
  checar('prestador sem bairro nao aparece na listagem', !nomesSemFiltro.includes(SEM_BAIRRO.nome));

  console.log('\nUS07 - Pausar perfil');
  const antesDaPausa = await chamar('/prestadores');
  checar('listagem mostra os dois prestadores ativos', antesDaPausa.dados.prestadores.length === 2);

  const pausa = await chamar('/prestadores/pausa', { metodo: 'PATCH', token: tokenJoao });
  checar('pausa altera o status para pausado', pausa.dados.status === 'pausado');

  const durantePausa = await chamar('/prestadores');
  checar('prestador pausado some da listagem', durantePausa.dados.prestadores.length === 1);

  const retomada = await chamar('/prestadores/pausa', { metodo: 'PATCH', token: tokenJoao });
  const depoisDaPausa = await chamar('/prestadores');
  checar('ao retomar, volta a aparecer com o perfil intacto',
    retomada.dados.status === 'ativo' && depoisDaPausa.dados.prestadores.length === 2);

  const donoJoao = await Prestador.findOne({ include: [{ association: 'usuario', where: { email: PRESTADOR.email } }] });
  const periodos = await Pausa.findAll({ where: { prestador_id: donoJoao.id }, order: [['id', 'ASC']] });
  checar('cada pausa vira um periodo com inicio e fim',
    periodos.length === 1 && periodos[0].inicio && periodos[0].fim && periodos[0].fim >= periodos[0].inicio);

  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: tokenJoao });
  const emAberto = await Pausa.findAll({ where: { prestador_id: donoJoao.id, fim: null } });
  checar('pausa em andamento fica com o fim em aberto', emAberto.length === 1);
  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: tokenJoao });
  const todos = await Pausa.count({ where: { prestador_id: donoJoao.id } });
  const abertos = await Pausa.count({ where: { prestador_id: donoJoao.id, fim: null } });
  checar('o historico guarda todos os periodos, e nenhum fica aberto depois de retomar', todos === 2 && abertos === 0);

  console.log('\nUS08 - Filtro de atendimento entre mulheres');
  const homemMarcando = await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: tokenJoao, corpo: { atende_apenas_mulheres: true }
  });
  checar('opcao indisponivel para quem nao e mulher', homemMarcando.status === 400);

  const comFiltro = await chamar('/prestadores?somente_mulheres=true');
  checar('filtro traz apenas prestadoras mulheres',
    comFiltro.dados.prestadores.length === 1 && comFiltro.dados.prestadores[0].nome === PRESTADORA.nome);

  const semFiltro = await chamar('/prestadores');
  checar('sem o filtro, a listagem traz todos', semFiltro.dados.prestadores.length === 2);

  console.log('\nUS04 - Pendencias bloqueiam a saida');
  const { registrarVerificador, limparVerificadores } = require('../src/servicos/pendencias');

  // Simula o que o Sprint 2 vai registrar de verdade (servico em andamento).
  registrarVerificador(async (usuarioId) => (usuarioId === salvo.id
    ? { tipo: 'servico', descricao: 'Servico em andamento', quantidade: 1 }
    : null));

  const comPendencia = await chamar('/conta/pendencias', { token: tokenAna });
  checar('a conta enxerga a propria pendencia',
    comPendencia.dados.pode_desativar === false && comPendencia.dados.pendencias.length === 1);

  const bloqueada = await chamar('/conta', { metodo: 'DELETE', token: tokenAna, corpo: { confirmacao: 'DESATIVAR' } });
  checar('nao desativa com pendencia em aberto', bloqueada.status === 409);

  const pedidoRecusado = await SolicitacaoExclusao.findAll({ where: { usuario_id: salvo.id } });
  checar('o pedido recusado por pendencia fica registrado, com data e origem',
    pedidoRecusado.length === 1 && pedidoRecusado[0].tipo === 'desativacao'
    && pedidoRecusado[0].resultado === 'recusada_pendencia'
    && pedidoRecusado[0].origem === 'painel_usuario' && pedidoRecusado[0].createdAt instanceof Date);

  limparVerificadores();
  const semPendencia = await chamar('/conta/pendencias', { token: tokenAna });
  checar('sem pendencia, a desativacao libera', semPendencia.dados.pode_desativar === true);

  console.log('\nUS04 - Desativar, voltar e apagar');
  const semConfirmar = await chamar('/conta', { metodo: 'DELETE', token: tokenAna, corpo: { confirmacao: 'sim' } });
  checar('exige a palavra DESATIVAR para confirmar', semConfirmar.status === 400);

  const desativacao = await chamar('/conta', { metodo: 'DELETE', token: tokenAna, corpo: { confirmacao: 'DESATIVAR' } });
  checar('desativa a conta', desativacao.status === 200);

  const guardado = await Usuario.findOne({ where: { id: salvo.id } });
  checar('conta guardada como inativa, com os dados preservados',
    guardado.status === 'inativo' && guardado.email === CONTRATANTE.email && guardado.cpf !== null);

  const novoCadastroMesmoCpf = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'outroemail@teste.com' }
  });
  checar('nao deixa criar conta nova com o mesmo CPF (antigolpe)', novoCadastroMesmoCpf.status === 409);
  checar('a mensagem nao revela que a conta esta inativa',
    !/inativa|desativad/i.test(novoCadastroMesmoCpf.dados.erro || ''));

  const loginInativa = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: CONTRATANTE.email, senha: CONTRATANTE.senha }
  });
  checar('login de conta inativa entra e sinaliza a reativacao',
    loginInativa.status === 200 && loginInativa.dados.conta_inativa === true);
  const tokenInativa = loginInativa.dados.token;

  const usoIndevido = await chamar('/conta', { metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'DESATIVAR' } });
  checar('conta inativa nao usa o resto da plataforma', usoIndevido.status === 403 && usoIndevido.dados.conta_inativa === true);

  const volta = await chamar('/conta/reativar', { metodo: 'POST', token: tokenInativa });
  checar('reativa e recupera os dados anteriores',
    volta.status === 200 && volta.dados.usuario.nome === CONTRATANTE.nome);

  const depoisDeVoltar = await chamar('/conta', { metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'errado' } });
  checar('apos reativar, passa pelo bloqueio de conta inativa (e so a confirmacao e cobrada)', depoisDeVoltar.status === 400);

  const apagarAtiva = await chamar('/conta/definitiva', {
    metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'APAGAR MEUS DADOS' }
  });
  checar('so apaga os dados depois de desativar', apagarAtiva.status === 409);

  await chamar('/conta', { metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'DESATIVAR' } });
  const apagou = await chamar('/conta/definitiva', {
    metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'APAGAR MEUS DADOS' }
  });
  checar('apaga os dados em definitivo', apagou.status === 200);

  const registros = await SolicitacaoExclusao.findAll({ where: { usuario_id: salvo.id }, order: [['id', 'ASC']] });
  const concluidas = registros.filter((r) => r.resultado === 'concluida');
  checar('cada pedido concluido fica registrado (2 desativacoes e 1 exclusao de dados)',
    concluidas.filter((r) => r.tipo === 'desativacao').length === 2
    && concluidas.filter((r) => r.tipo === 'exclusao_dados').length === 1);
  checar('o registro dos pedidos sobrevive a anonimizacao da conta',
    registros.length === 4 && registros.every((r) => r.origem === 'painel_usuario'));

  const anonimizado = await Usuario.findOne({ where: { id: salvo.id } });
  checar('dados pessoais anonimizados no banco',
    anonimizado.email === null && anonimizado.cpf === null && anonimizado.nome === 'Usuario removido');

  const tokenAntigo = await chamar('/conta', { token: tokenInativa });
  checar('token antigo deixa de funcionar apos apagar os dados', tokenAntigo.status === 401);

  console.log('\nUS04 - Depois de apagar os dados');
  const mesmoCpfDepois = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, nome: 'Ana Souza Nova', email: 'ana.nova@teste.com' }
  });
  checar('apos apagar os dados o CPF fica livre, e o novo cadastro nao herda nada da conta antiga',
    mesmoCpfDepois.status === 201 && mesmoCpfDepois.dados.usuario.nome === 'Ana Souza Nova');

  console.log('\nUS04 - Retencao de conta inativa (12 meses, aviso 30 dias antes)');
  const { processarRetencao, somarMeses } = require('../src/servicos/retencao');
  const DIA_MS = 24 * 60 * 60 * 1000;

  // A rotina avisa por e-mail; sem SMTP o aviso cai no console. Silencia no teste.
  async function rodarRetencao(agora) {
    const original = console.log;
    console.log = () => {};
    try { return await processarRetencao(agora); } finally { console.log = original; }
  }

  async function contaInativa(dados) {
    const cad = await chamar('/auth/register', { metodo: 'POST', corpo: dados });
    await chamar('/conta', { metodo: 'DELETE', token: cad.dados.token, corpo: { confirmacao: 'DESATIVAR' } });
    return Usuario.findOne({ where: { email: dados.email } });
  }

  const TEO = {
    nome: 'Teo Lima', cpf: '34608514300', email: 'teo@teste.com', telefone: '19999990000',
    senha: 'senha1234', tipo_perfil: 'contratante', aceite_termos: true
  };
  const teo = await contaInativa(TEO);
  const vencimentoTeo = somarMeses(teo.desativado_em, 12);

  const logo = await rodarRetencao(new Date());
  checar('conta recem desativada nao recebe aviso nem e anonimizada',
    logo.avisadas === 0 && logo.anonimizadas === 0);

  const ativas = await Usuario.count({ where: { status: 'ativo' } });
  await rodarRetencao(new Date(vencimentoTeo.getTime() - 60 * DIA_MS));
  checar('conta ativa nunca e tocada pela rotina', (await Usuario.count({ where: { status: 'ativo' } })) === ativas);

  const dentroDoAviso = new Date(vencimentoTeo.getTime() - 20 * DIA_MS);
  const aviso = await rodarRetencao(dentroDoAviso);
  await teo.reload();
  checar('a 30 dias do vencimento a conta recebe o aviso',
    aviso.avisadas === 1 && aviso.anonimizadas === 0 && teo.aviso_retencao_em !== null && teo.status === 'inativo');

  const avisoRepetido = await rodarRetencao(new Date(dentroDoAviso.getTime() + DIA_MS));
  checar('o aviso nao e enviado de novo no dia seguinte', avisoRepetido.avisadas === 0);

  const passouPrazoSemAviso = await rodarRetencao(new Date(vencimentoTeo.getTime() + DIA_MS));
  await teo.reload();
  checar('passou o prazo, mas ainda nao houve 30 dias de aviso: nada e apagado',
    passouPrazoSemAviso.anonimizadas === 0 && teo.status === 'inativo');

  const depoisDoAviso = await rodarRetencao(new Date(dentroDoAviso.getTime() + 31 * DIA_MS));
  await teo.reload();
  checar('vencido o prazo e cumpridos 30 dias de aviso, os dados sao anonimizados',
    depoisDoAviso.anonimizadas === 1 && teo.status === 'excluido'
    && teo.email === null && teo.cpf === null && teo.nome === 'Usuario removido');

  const logTeo = await SolicitacaoExclusao.findAll({ where: { usuario_id: teo.id } });
  checar('a exclusao automatica fica registrada com origem da rotina',
    logTeo.some((r) => r.origem === 'rotina_automatica' && r.tipo === 'exclusao_dados' && r.resultado === 'concluida'));

  const UMA = {
    nome: 'Uma Reis', cpf: '11122233396', email: 'uma@teste.com', telefone: '19999990000',
    senha: 'senha1234', tipo_perfil: 'contratante', aceite_termos: true
  };
  const uma = await contaInativa(UMA);
  const umAnoEMeio = somarMeses(new Date(), -18);
  uma.desativado_em = umAnoEMeio;
  uma.aviso_retencao_em = new Date(Date.now() - 20 * DIA_MS);
  await uma.save();
  const voltouAEntrar = await chamar('/auth/login', { metodo: 'POST', corpo: { email: UMA.email, senha: UMA.senha } });
  await uma.reload();
  checar('entrar na conta zera o relogio e cancela o aviso',
    voltouAEntrar.status === 200 && uma.aviso_retencao_em === null && uma.ultimo_acesso_em !== null);

  const aposVoltar = await rodarRetencao(new Date());
  await uma.reload();
  checar('conta que voltou a entrar nao e apagada', aposVoltar.anonimizadas === 0 && uma.status === 'inativo');

  const VERA = {
    nome: 'Vera Costa', cpf: '12345678909', email: 'vera@teste.com', telefone: '19999990000',
    senha: 'senha1234', tipo_perfil: 'contratante', aceite_termos: true
  };
  const vera = await contaInativa(VERA);
  vera.desativado_em = somarMeses(new Date(), -18);
  vera.aviso_retencao_em = new Date(Date.now() - 60 * DIA_MS);
  await vera.save();
  registrarVerificador(async (usuarioId) => (usuarioId === vera.id
    ? { tipo: 'servico', descricao: 'Servico em andamento', quantidade: 1 }
    : null));
  const rodadaComPendencia = await rodarRetencao(new Date());
  await vera.reload();
  checar('conta com pendencia em aberto nunca e anonimizada pela rotina',
    rodadaComPendencia.anonimizadas === 0 && vera.status === 'inativo');
  limparVerificadores();
  const rodadaSemPendencia = await rodarRetencao(new Date());
  await vera.reload();
  checar('resolvida a pendencia, a rotina conclui a anonimizacao',
    rodadaSemPendencia.anonimizadas === 1 && vera.status === 'excluido');

  console.log('\nUS04 - Apagar os dados tambem apaga a foto do disco');
  const LIA = {
    nome: 'Lia Prado', cpf: '93541134780', email: 'lia@teste.com', telefone: '19999990000',
    senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
  };
  const cadLia = await chamar('/auth/register', { metodo: 'POST', corpo: LIA });
  const fotoLia = await enviarFoto(cadLia.dados.token, PNG);
  checar('prestadora envia a foto antes de sair', fotoLia.status === 200 && (await buscarArquivo(fotoLia.dados.foto_url)).status === 200);

  await chamar('/conta', { metodo: 'DELETE', token: cadLia.dados.token, corpo: { confirmacao: 'DESATIVAR' } });
  checar('desativar a conta mantem a foto (os dados ficam guardados)', (await buscarArquivo(fotoLia.dados.foto_url)).status === 200);

  const apagouLia = await chamar('/conta/definitiva', {
    metodo: 'DELETE', token: cadLia.dados.token, corpo: { confirmacao: 'APAGAR MEUS DADOS' }
  });
  checar('apagar os dados remove o arquivo da foto (LGPD)',
    apagouLia.status === 200 && (await buscarArquivo(fotoLia.dados.foto_url)).status === 404);


  // =======================================================================
  // SPRINT 2 - US09, US10, US12, US13 e US26 (curinga CC06)
  // =======================================================================

  const HORA = 60 * 60 * 1000;
  const DIA = 24 * HORA;
  // Amanha + 1 dia, hora cheia: sempre no futuro, longe da virada do dia.
  const T = new Date(Math.ceil((Date.now() + 2 * DIA) / HORA) * HORA);
  const iso = (data) => data.toISOString();

  const taquaral = await Bairro.create({ nome: 'Taquaral', cidade: 'Campinas' });
  const centro = await Bairro.create({ nome: 'Centro', cidade: 'Campinas' });
  const [eletricista, , pintor, , , jardinagem] = idsCategorias;

  async function cadastrarPrestador(dados, perfil) {
    const cad = await chamar('/auth/register', { metodo: 'POST', corpo: { ...dados, tipo_perfil: 'prestador', aceite_termos: true } });
    const salvoPerfil = await chamar('/prestadores/meu-perfil', { metodo: 'PUT', token: cad.dados.token, corpo: perfil });
    return { token: cad.dados.token, id: salvoPerfil.dados.prestador.id };
  }
  async function cadastrarContratante(dados) {
    const cad = await chamar('/auth/register', { metodo: 'POST', corpo: { ...dados, tipo_perfil: 'contratante', aceite_termos: true } });
    return { token: cad.dados.token, id: cad.dados.usuario.id };
  }

  const eli = await cadastrarPrestador(
    { nome: 'Eli Santos', cpf: '74682489070', email: 'eli@teste.com', telefone: '19999990000', senha: 'senha1234', sexo: 'masculino' },
    { descricao: 'Eletricista residencial.', categorias: [eletricista], bairros: [bairro.id] }
  );
  const gil = await cadastrarPrestador(
    { nome: 'Gil Prado', cpf: '29537914852', email: 'gil@teste.com', telefone: '19999990000', senha: 'senha1234', sexo: 'masculino' },
    { descricao: 'Eletrica e iluminacao.', categorias: [eletricista], bairros: [taquaral.id] }
  );
  const mara = await cadastrarContratante({
    nome: 'Mara Lopes', cpf: '82235316077', email: 'mara@teste.com', telefone: '19999990000', senha: 'senha1234', sexo: 'feminino'
  });
  const otto = await cadastrarContratante({
    nome: 'Otto Reis', cpf: '05336148059', email: 'otto@teste.com', telefone: '19999990000', senha: 'senha1234', sexo: 'masculino'
  });
  const rita = await Prestador.findOne({ include: [{ association: 'usuario', where: { email: PRESTADORA.email } }] });
  const nomes = (resposta) => (resposta.dados.prestadores || []).map((p) => p.nome);

  console.log('\nUS09 - Busca por categoria e bairro');
  const porCategoria = await chamar(`/prestadores?categoria=${eletricista}`);
  checar('a busca por categoria traz so quem atende a categoria',
    porCategoria.status === 200 && nomes(porCategoria).includes('Eli Santos') && nomes(porCategoria).includes('Gil Prado')
    && nomes(porCategoria).includes(PRESTADORA.nome) && !nomes(porCategoria).includes(PRESTADOR.nome));

  const porBairro = await chamar(`/prestadores?bairro=${taquaral.id}`);
  checar('a busca por bairro traz so quem atende o bairro',
    nomes(porBairro).length === 1 && nomes(porBairro)[0] === 'Gil Prado');

  const porAmbos = await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`);
  checar('categoria e bairro juntos: so quem atende os dois',
    nomes(porAmbos).length === 2 && nomes(porAmbos).includes('Eli Santos') && nomes(porAmbos).includes(PRESTADORA.nome));

  const cartaoRita = porAmbos.dados.prestadores.find((p) => p.nome === PRESTADORA.nome);
  checar('filtrar por categoria nao esconde as outras categorias do cartao', cartaoRita.categorias.length === 2);

  const vazia = await chamar(`/prestadores?categoria=${jardinagem}&bairro=${bairro.id}`);
  checar('busca sem resultado responde lista vazia (a tela orienta o usuario)',
    vazia.status === 200 && vazia.dados.prestadores.length === 0);

  const filtroRuim = await chamar('/prestadores?categoria=abc');
  checar('filtro invalido e recusado', filtroRuim.status === 400);

  const mulheresEletricistas = await chamar(`/prestadores?categoria=${eletricista}&somente_mulheres=true`);
  checar('o filtro entre mulheres (US08) continua valendo junto com a busca',
    nomes(mulheresEletricistas).length === 1 && nomes(mulheresEletricistas)[0] === PRESTADORA.nome);

  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: eli.token });
  const comPausado = await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`);
  checar('prestador pausado nao aparece no resultado', !nomes(comPausado).includes('Eli Santos'));
  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: eli.token });

  await Prestador.update({ status: 'suspenso' }, { where: { id: gil.id } });
  const comSuspenso = await chamar(`/prestadores?categoria=${eletricista}`);
  checar('prestador suspenso nao aparece no resultado', !nomes(comSuspenso).includes('Gil Prado'));
  await Prestador.update({ status: 'ativo' }, { where: { id: gil.id } });

  checar('o cartao traz nome, nota media, servicos concluidos e selo',
    porAmbos.dados.prestadores.every((p) => typeof p.nome === 'string' && 'nota_media' in p
      && typeof p.servicos_concluidos === 'number' && typeof p.verificado === 'boolean'));

  await Prestador.update({ verificado: true }, { where: { id: rita.id } });
  const comSelo = await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`);
  checar('o selo aparece para quem tem a identidade verificada (o campo e marcado pela US06)',
    comSelo.dados.prestadores.find((p) => p.nome === PRESTADORA.nome).verificado === true
    && comSelo.dados.prestadores.find((p) => p.nome === 'Eli Santos').verificado === false);

  // Sem avaliacoes nem servicos concluidos: vale a ordem de cadastro (Rita antes de Eli).
  const semNota = nomes(comSelo);
  await Prestador.update({ nota_media: 4.2 }, { where: { id: rita.id } });
  await Prestador.update({ nota_media: 4.8 }, { where: { id: eli.id } });
  const porNota = await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`);
  checar('ordena pela avaliacao media, da maior para a menor',
    semNota[0] === PRESTADORA.nome && nomes(porNota)[0] === 'Eli Santos'
    && porNota.dados.prestadores[0].nota_media === 4.8);

  await Prestador.update({ nota_media: null }, { where: { id: [rita.id, eli.id] } });
  const contratanteMara = await sequelize.models.Usuario.findByPk(mara.id);
  await Servico.bulkCreate([
    { id_contratante: contratanteMara.id, id_prestador: eli.id, bairro_id: bairro.id, descricao: 'Concluido antes', fotos: [], data_hora_solicitada: new Date(Date.now() - 10 * DIA), status: 'pago' },
    { id_contratante: contratanteMara.id, id_prestador: eli.id, bairro_id: bairro.id, descricao: 'Confirmado antes', fotos: [], data_hora_solicitada: new Date(Date.now() - 9 * DIA), status: 'confirmado' },
    { id_contratante: contratanteMara.id, id_prestador: eli.id, bairro_id: bairro.id, descricao: 'Cancelado antes', fotos: [], data_hora_solicitada: new Date(Date.now() - 8 * DIA), status: 'cancelado' }
  ]);
  const porConcluidos = await chamar(`/prestadores?categoria=${eletricista}&bairro=${bairro.id}`);
  const cartaoEli = porConcluidos.dados.prestadores.find((p) => p.nome === 'Eli Santos');
  checar('com a mesma avaliacao, ordena pelo numero de servicos concluidos',
    nomes(porConcluidos)[0] === 'Eli Santos' && cartaoEli.servicos_concluidos === 2);

  const indicesCategoria = await sequelize.getQueryInterface().showIndex('prestador_categorias');
  const indicesBairro = await sequelize.getQueryInterface().showIndex('prestador_bairros');
  checar('existe indice no banco para os campos de filtro (categoria e bairro)',
    indicesCategoria.some((i) => i.name === 'idx_prestador_categorias_categoria')
    && indicesBairro.some((i) => i.name === 'idx_prestador_bairros_bairro'));

  console.log('\nUS10 - Solicitacao de servico e orcamento');
  const pedidoBase = { id_prestador: eli.id, bairro_id: bairro.id, descricao: 'Trocar o chuveiro e uma tomada.', data_hora: iso(T) };

  const pedidoMara = await chamar('/servicos', { metodo: 'POST', token: mara.token, corpo: pedidoBase });
  checar('o contratante abre a solicitacao', pedidoMara.status === 201 && pedidoMara.dados.servico.status === 'aguardando_orcamento');
  const idPedido = pedidoMara.dados.servico.id;

  const pendencias = await chamar('/servicos', { token: eli.token });
  checar('a solicitacao aparece na lista de pendencias do prestador',
    pendencias.dados.servicos.some((s) => s.id === idPedido && s.status === 'aguardando_orcamento' && s.papel === 'prestador'));

  const meusPedidos = await chamar('/servicos', { token: mara.token });
  checar('o contratante ve o pedido na lista dele', meusPedidos.dados.servicos.some((s) => s.id === idPedido));

  const semDescricao = await chamar('/servicos', { metodo: 'POST', token: mara.token, corpo: { ...pedidoBase, descricao: '  ' } });
  checar('pedido sem descricao e recusado', semDescricao.status === 400);

  const bairroInvalido = await chamar('/servicos', { metodo: 'POST', token: mara.token, corpo: { ...pedidoBase, bairro_id: 99999 } });
  checar('pedido sem bairro valido e recusado', bairroInvalido.status === 400);

  const prestadorPedindo = await chamar('/servicos', { metodo: 'POST', token: gil.token, corpo: pedidoBase });
  checar('prestador nao abre solicitacao (so contratante)', prestadorPedindo.status === 403);

  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: gil.token });
  const paraPausado = await chamar('/servicos', { metodo: 'POST', token: mara.token, corpo: { ...pedidoBase, id_prestador: gil.id } });
  checar('nao da para pedir a quem esta pausado', paraPausado.status === 404);
  await chamar('/prestadores/pausa', { metodo: 'PATCH', token: gil.token });

  await Prestador.update({ atende_apenas_mulheres: true }, { where: { id: rita.id } });
  const homemParaRita = await chamar('/servicos', {
    metodo: 'POST', token: otto.token, corpo: { ...pedidoBase, id_prestador: rita.id, data_hora: iso(new Date(T.getTime() + 5 * HORA)) }
  });
  checar('quem atende apenas mulheres nao recebe pedido de homem (US08)', homemParaRita.status === 403);
  await Prestador.update({ atende_apenas_mulheres: false }, { where: { id: rita.id } });

  console.log('\nUS10 - Fotos do pedido');
  const comFotos = await chamarForm('/servicos', {
    token: mara.token,
    campos: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + 10 * HORA)) },
    arquivos: [{ campo: 'fotos', bytes: PNG }, { campo: 'fotos', bytes: PNG }]
  });
  checar('o pedido aceita fotos', comFotos.status === 201 && comFotos.dados.servico.fotos.length === 2);
  const idComFotos = comFotos.dados.servico.id;
  const nomeFoto = comFotos.dados.servico.fotos[0];

  const quatroFotos = await chamarForm('/servicos', {
    token: mara.token, campos: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + 20 * HORA)) },
    arquivos: [1, 2, 3, 4].map(() => ({ campo: 'fotos', bytes: PNG }))
  });
  checar('mais de 3 fotos e recusado', quatroFotos.status === 400);

  const fotoFalsa = await chamarForm('/servicos', {
    token: mara.token, campos: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + 20 * HORA)) },
    arquivos: [{ campo: 'fotos', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), nome: 'x.svg', tipo: 'image/svg+xml' }]
  });
  checar('arquivo que nao e imagem (ou SVG) e recusado', fotoFalsa.status === 400);

  const parteAbre = await baixar(`/servicos/${idComFotos}/arquivos/${nomeFoto}`, eli.token);
  checar('as partes abrem a foto do pedido', parteAbre.status === 200 && parteAbre.tipo === 'image/png');
  const terceiroAbre = await baixar(`/servicos/${idComFotos}/arquivos/${nomeFoto}`, otto.token);
  checar('um terceiro nao abre a foto do pedido', terceiroAbre.status === 404);
  const publica = await buscarArquivo(`/uploads/servicos/${nomeFoto}`);
  checar('a foto do pedido nao fica em endereco publico', publica.status === 404);

  // JPEG com bloco EXIF levando coordenadas de GPS.
  const segmento = (marcador, conteudo) => {
    const tamanho = Buffer.alloc(2); tamanho.writeUInt16BE(conteudo.length + 2);
    return Buffer.concat([Buffer.from([0xff, marcador]), tamanho, conteudo]);
  };
  const JPG_GPS = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmento(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segmento(0xe1, Buffer.from('Exif\0\0GPS-LAT-22.9064-LON-47.0616', 'latin1')),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 2, 3, 4, 5, 6, 0x11, 0x22, 0xff, 0xd9])
  ]);
  const comGps = await chamarForm('/servicos', {
    token: mara.token, campos: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + 30 * HORA)) },
    arquivos: [{ campo: 'fotos', bytes: JPG_GPS, nome: 'casa.jpg', tipo: 'image/jpeg' }]
  });
  const fotoGps = await baixar(`/servicos/${comGps.dados.servico.id}/arquivos/${comGps.dados.servico.fotos[0]}`, eli.token);
  checar('a localizacao gravada na foto (GPS) e apagada antes de chegar ao prestador',
    comGps.status === 201 && fotoGps.status === 200 && !fotoGps.bytes.includes('GPS-LAT')
    && fotoGps.bytes.includes('JFIF') && fotoGps.bytes[0] === 0xff && fotoGps.bytes[1] === 0xd8);

  console.log('\nUS02 - Usuario A nao acessa, pela URL, um servico de B');
  const outroContratante = await chamar(`/servicos/${idPedido}`, { token: otto.token });
  checar('outro contratante recebe 404 ao abrir o servico pela URL', outroContratante.status === 404);
  const outroPrestador = await chamar(`/servicos/${idPedido}`, { token: gil.token });
  checar('outro prestador tambem nao abre', outroPrestador.status === 404);
  const dono = await chamar(`/servicos/${idPedido}`, { token: mara.token });
  checar('as duas partes abrem o servico',
    dono.status === 200 && (await chamar(`/servicos/${idPedido}`, { token: eli.token })).status === 200);

  console.log('\nUS10 - Orcamento');
  const orcamentoBase = { valor: 180, prazo_horas: 2, data_hora: iso(T) };
  const contratanteOrcando = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: mara.token, corpo: orcamentoBase });
  checar('so o prestador responde o orcamento', contratanteOrcando.status === 403);

  const valorZero = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: eli.token, corpo: { ...orcamentoBase, valor: 0 } });
  const valorNegativo = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: eli.token, corpo: { ...orcamentoBase, valor: -50 } });
  checar('valor zerado ou negativo e recusado', valorZero.status === 400 && valorNegativo.status === 400);

  const prazoRuim = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: eli.token, corpo: { ...orcamentoBase, prazo_horas: 0 } });
  checar('prazo invalido e recusado', prazoRuim.status === 400);

  const taxaDentro = await chamar(`/servicos/${idPedido}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { ...orcamentoBase, taxa_deslocamento: 20 }
  });
  checar('dentro da area do prestador nao cabe taxa de deslocamento', taxaDentro.status === 400);

  const orcamento = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: eli.token, corpo: orcamentoBase });
  checar('o prestador envia o orcamento', orcamento.status === 200 && orcamento.dados.servico.status === 'orcamento_enviado');

  const deNovo = await chamar(`/servicos/${idPedido}/orcamento`, { metodo: 'POST', token: eli.token, corpo: orcamentoBase });
  checar('o mesmo pedido nao recebe dois orcamentos', deNovo.status === 409);

  // Pedido em bairro fora da area do Eli (ele atende so o Cambui).
  const foraArea = await chamar('/servicos', {
    metodo: 'POST', token: mara.token, corpo: { ...pedidoBase, bairro_id: centro.id, data_hora: iso(new Date(T.getTime() + 40 * HORA)) }
  });
  const idFora = foraArea.dados.servico.id;
  const detalheForaPrestador = await chamar(`/servicos/${idFora}`, { token: eli.token });
  checar('o prestador sabe que o pedido esta fora da area dele', detalheForaPrestador.dados.servico.fora_da_area === true);
  const semTaxa = await chamar(`/servicos/${idFora}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: 250, prazo_horas: 3, data_hora: iso(new Date(T.getTime() + 40 * HORA)) }
  });
  checar('fora da area, a taxa de deslocamento precisa ser informada', semTaxa.status === 400);
  const taxaNegativa = await chamar(`/servicos/${idFora}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: 250, prazo_horas: 3, taxa_deslocamento: -5, data_hora: iso(new Date(T.getTime() + 40 * HORA)) }
  });
  checar('taxa de deslocamento negativa e recusada', taxaNegativa.status === 400);
  const comTaxa = await chamar(`/servicos/${idFora}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: '250,50', prazo_horas: 3, taxa_deslocamento: 30, data_hora: iso(new Date(T.getTime() + 40 * HORA)) }
  });
  checar('fora da area, o orcamento vai com a taxa de deslocamento', comTaxa.status === 200);

  const vistoPeloContratante = await chamar(`/servicos/${idFora}`, { token: mara.token });
  const orc = vistoPeloContratante.dados.servico.orcamento;
  checar('o orcamento chega ao contratante com valor, prazo e deslocamento separados',
    orc && orc.valor === 250.5 && orc.prazo_horas === 3 && orc.taxa_deslocamento === 30 && orc.total === 280.5);

  const prestadorRecusando = await chamar(`/servicos/${idFora}/recusar`, { metodo: 'POST', token: eli.token });
  checar('so o contratante recusa o orcamento', prestadorRecusando.status === 403);

  const recusaSemOrcamento = await chamar(`/servicos/${idComFotos}/recusar`, { metodo: 'POST', token: mara.token });
  checar('nao ha o que recusar antes de chegar o orcamento', recusaSemOrcamento.status === 409);

  const recusa = await chamar(`/servicos/${idFora}/recusar`, { metodo: 'POST', token: mara.token });
  checar('o contratante consegue recusar e o servico e encerrado',
    recusa.status === 200 && recusa.dados.servico.status === 'recusado' && Boolean(recusa.dados.servico.encerrado_em)
    && recusa.dados.servico.chat_aberto === false);
  const recusaDeNovo = await chamar(`/servicos/${idFora}/recusar`, { metodo: 'POST', token: mara.token });
  checar('servico encerrado nao e recusado de novo', recusaDeNovo.status === 409);

  console.log('\nUS13 - Agendamento de data e hora');
  const detalhe = await chamar(`/servicos/${idPedido}`, { token: mara.token });
  checar('a data e a hora vao na solicitacao e na proposta',
    new Date(detalhe.dados.servico.data_hora_solicitada).getTime() === T.getTime()
    && new Date(detalhe.dados.servico.data_hora_proposta).getTime() === T.getTime());

  const passado = await chamar('/servicos', {
    metodo: 'POST', token: mara.token, corpo: { ...pedidoBase, data_hora: iso(new Date(Date.now() - HORA)) }
  });
  checar('data no passado e recusada na solicitacao', passado.status === 400);

  const mesmoHorario = await chamar('/servicos', {
    metodo: 'POST', token: otto.token, corpo: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + HORA)) }
  });
  checar('nao e possivel agendar dois servicos no mesmo horario para o mesmo prestador', mesmoHorario.status === 409);

  const outroPrestadorMesmaHora = await chamar('/servicos', {
    metodo: 'POST', token: otto.token, corpo: { ...pedidoBase, id_prestador: gil.id, bairro_id: taquaral.id }
  });
  checar('o mesmo horario continua livre para outro prestador', outroPrestadorMesmaHora.status === 201);

  const depoisDoPrazo = await chamar('/servicos', {
    metodo: 'POST', token: otto.token, corpo: { ...pedidoBase, data_hora: iso(new Date(T.getTime() + 2 * HORA)) }
  });
  checar('terminado o prazo do outro servico, o horario fica livre', depoisDoPrazo.status === 201);
  const idOtto = depoisDoPrazo.dados.servico.id;

  const propostaPassado = await chamar(`/servicos/${idOtto}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: 90, prazo_horas: 1, data_hora: iso(new Date(Date.now() - HORA)) }
  });
  checar('data no passado e recusada na proposta', propostaPassado.status === 400);

  const propostaSobreposta = await chamar(`/servicos/${idOtto}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: 90, prazo_horas: 1, data_hora: iso(new Date(T.getTime() + HORA)) }
  });
  checar('o prestador nao propoe horario que ja esta ocupado', propostaSobreposta.status === 409);

  const propostaLivre = await chamar(`/servicos/${idOtto}/orcamento`, {
    metodo: 'POST', token: eli.token, corpo: { valor: 90, prazo_horas: 1, data_hora: iso(new Date(T.getTime() + 2 * HORA)) }
  });
  checar('em horario livre a proposta e aceita', propostaLivre.status === 200);

  const agendaAntes = await chamar('/servicos/agenda', { token: mara.token });
  const agendaPrestadorAntes = await chamar('/servicos/agenda', { token: eli.token });
  checar('antes do aceite o compromisso nao esta na agenda',
    !agendaAntes.dados.compromissos.some((c) => c.id === idPedido)
    && !agendaPrestadorAntes.dados.compromissos.some((c) => c.id === idPedido));

  // O aceite e a US11 (proximo sprint). Aqui ele e simulado direto no banco.
  const servicoAceito = await Servico.findByPk(idPedido);
  servicoAceito.status = 'aceito';
  await servicoAceito.save();

  const agendaContratante = await chamar('/servicos/agenda', { token: mara.token });
  const agendaPrestador = await chamar('/servicos/agenda', { token: eli.token });
  const agendaTerceiro = await chamar('/servicos/agenda', { token: otto.token });
  checar('depois do aceite o compromisso aparece na agenda dos dois lados',
    agendaContratante.dados.compromissos.some((c) => c.id === idPedido)
    && agendaPrestador.dados.compromissos.some((c) => c.id === idPedido));
  checar('o compromisso nao aparece na agenda de quem nao e parte',
    !agendaTerceiro.dados.compromissos.some((c) => c.id === idPedido));

  const cedo = await capturarConsole(() => processarLembretes(new Date(T.getTime() - 30 * HORA)));
  checar('mais de um dia antes, o lembrete ainda nao sai', cedo.resultado.enviados === 0);
  const vespera = await capturarConsole(() => processarLembretes(new Date(T.getTime() - 23 * HORA)));
  const destinatarios = vespera.linhas.filter((l) => l.includes('[lembrete] destinatario:')).join(' ');
  checar('na vespera, o lembrete vai para as duas partes',
    vespera.resultado.enviados === 1 && destinatarios.includes('mara@teste.com') && destinatarios.includes('eli@teste.com'));
  const lembreteRepetido = await capturarConsole(() => processarLembretes(new Date(T.getTime() - 22 * HORA)));
  checar('o lembrete sai uma vez so', lembreteRepetido.resultado.enviados === 0);

  console.log('\nUS12 - Chat interno do servico');
  const primeira = await chamar(`/servicos/${idComFotos}/mensagens`, {
    metodo: 'POST', token: mara.token, corpo: { texto: 'Oi! O chuveiro fica no banheiro de cima.' }
  });
  checar('a parte envia mensagem de texto', primeira.status === 201 && primeira.dados.mensagem.minha === true);

  const resposta = await chamarForm(`/servicos/${idComFotos}/mensagens`, {
    token: eli.token, campos: { texto: 'Entendi. Olha o disjuntor:' }, arquivos: [{ campo: 'imagem', bytes: PNG }]
  });
  checar('a outra parte responde com texto e imagem', resposta.status === 201 && Boolean(resposta.dados.mensagem.imagem));
  const nomeImagemChat = resposta.dados.mensagem.imagem;

  const leitura = await chamar(`/servicos/${idComFotos}/mensagens`, { token: mara.token });
  checar('as duas mensagens ficam salvas, na ordem, e cada lado sabe quais sao suas',
    leitura.status === 200 && leitura.dados.mensagens.length === 2
    && leitura.dados.mensagens[0].minha === true && leitura.dados.mensagens[1].minha === false);

  const novas = await chamar(`/servicos/${idComFotos}/mensagens?depois=${primeira.dados.mensagem.id}`, { token: mara.token });
  checar('da para buscar so as mensagens novas', novas.dados.mensagens.length === 1);

  const imagemParte = await baixar(`/servicos/${idComFotos}/arquivos/${nomeImagemChat}`, mara.token);
  checar('a parte abre a imagem do chat', imagemParte.status === 200);

  const terceiroLe = await chamar(`/servicos/${idComFotos}/mensagens`, { token: otto.token });
  const terceiroEscreve = await chamar(`/servicos/${idComFotos}/mensagens`, { metodo: 'POST', token: otto.token, corpo: { texto: 'oi' } });
  const terceiroImagem = await baixar(`/servicos/${idComFotos}/arquivos/${nomeImagemChat}`, gil.token);
  checar('um terceiro usuario nao consegue abrir o chat daquele servico',
    terceiroLe.status === 404 && terceiroEscreve.status === 404 && terceiroImagem.status === 404);

  const vaziaMsg = await chamar(`/servicos/${idComFotos}/mensagens`, { metodo: 'POST', token: mara.token, corpo: { texto: '   ' } });
  checar('mensagem vazia e recusada', vaziaMsg.status === 400);
  const imagemFalsa = await chamarForm(`/servicos/${idComFotos}/mensagens`, {
    token: mara.token, arquivos: [{ campo: 'imagem', bytes: Buffer.from('nao sou imagem'), nome: 'a.png' }]
  });
  checar('imagem que nao e imagem e recusada', imagemFalsa.status === 400);

  const apagarMensagem = await chamar(`/servicos/${idComFotos}/mensagens/${primeira.dados.mensagem.id}`, { metodo: 'DELETE', token: mara.token });
  checar('nao existe forma de apagar mensagem (ficam para consulta em disputa)', apagarMensagem.status === 404);

  const recusadoEscreve = await chamar(`/servicos/${idFora}/mensagens`, { metodo: 'POST', token: mara.token, corpo: { texto: 'oi' } });
  checar('servico encerrado (recusado) nao recebe mensagem nova', recusadoEscreve.status === 409);

  // A conclusao e de outra historia (US20); aqui ela e simulada no banco.
  const servicoConcluido = await Servico.findByPk(idComFotos);
  servicoConcluido.status = 'concluido';
  await servicoConcluido.save();
  const aposConclusao = await chamar(`/servicos/${idComFotos}/mensagens`, { metodo: 'POST', token: eli.token, corpo: { texto: 'mais uma' } });
  checar('o chat encerra o envio de novas mensagens apos a conclusao do servico', aposConclusao.status === 409);
  const consultaDepois = await chamar(`/servicos/${idComFotos}/mensagens`, { token: mara.token });
  checar('depois de encerrado, as mensagens continuam disponiveis para consulta (disputa)',
    consultaDepois.status === 200 && consultaDepois.dados.mensagens.length === 2 && consultaDepois.dados.chat_aberto === false);

  console.log('\nUS12 - Prazo de guarda das midias (90 dias apos encerrar)');
  await servicoConcluido.reload();
  const encerrou = new Date(servicoConcluido.encerrado_em).getTime();
  const antesDoPrazo = await processarRetencaoMidias(new Date(encerrou + 89 * DIA));
  const aindaGuardada = await baixar(`/servicos/${idComFotos}/arquivos/${nomeImagemChat}`, mara.token);
  checar('dentro do prazo, as midias continuam guardadas', antesDoPrazo.servicos === 0 && aindaGuardada.status === 200);

  await processarRetencaoMidias(new Date(encerrou + 91 * DIA));
  const imagemDepois = await baixar(`/servicos/${idComFotos}/arquivos/${nomeImagemChat}`, mara.token);
  const fotoDepois = await baixar(`/servicos/${idComFotos}/arquivos/${nomeFoto}`, mara.token);
  const conversaDepois = await chamar(`/servicos/${idComFotos}/mensagens`, { token: mara.token });
  const msgComImagem = conversaDepois.dados.mensagens[1];
  checar('vencido o prazo, imagens do chat e fotos do pedido saem do disco',
    imagemDepois.status === 404 && fotoDepois.status === 404);
  checar('o texto das mensagens continua guardado e o chat avisa que a imagem foi removida',
    msgComImagem.texto === 'Entendi. Olha o disjuntor:' && msgComImagem.imagem === null && msgComImagem.imagem_removida === true);
  const guardadas = await Mensagem.count({ where: { servico_id: idComFotos } });
  checar('nenhuma mensagem e apagada pela rotina', guardadas === 2);

  console.log('\nUS26 (curinga CC06) - Alterar a senha estando logado');
  const segundaSessao = await chamar('/auth/login', { metodo: 'POST', corpo: { email: 'mara@teste.com', senha: 'senha1234' } });
  const tokenOutroAparelho = segundaSessao.dados.token;

  const semLoginSenha = await chamar('/conta/senha', { metodo: 'PUT', corpo: { senha_atual: 'senha1234', nova_senha: 'novaSenha99' } });
  checar('trocar a senha exige login', semLoginSenha.status === 401);

  const atualErrada = await chamar('/conta/senha', {
    metodo: 'PUT', token: mara.token, corpo: { senha_atual: 'errada123', nova_senha: 'novaSenha99' }
  });
  checar('senha atual incorreta e recusada (sem derrubar a sessao)', atualErrada.status === 400);

  const novaFraca = await chamar('/conta/senha', {
    metodo: 'PUT', token: mara.token, corpo: { senha_atual: 'senha1234', nova_senha: '1234' }
  });
  checar('nova senha fraca e recusada', novaFraca.status === 400);

  const novaIgual = await chamar('/conta/senha', {
    metodo: 'PUT', token: mara.token, corpo: { senha_atual: 'senha1234', nova_senha: 'senha1234' }
  });
  checar('nova senha igual a atual e recusada', novaIgual.status === 400);

  const troca = await chamar('/conta/senha', {
    metodo: 'PUT', token: mara.token, corpo: { senha_atual: 'senha1234', nova_senha: 'novaSenha99' }
  });
  checar('com a senha atual certa e uma nova forte, a troca acontece e volta um token novo',
    troca.status === 200 && Boolean(troca.dados.token) && troca.dados.token !== mara.token);

  const loginAntigaMara = await chamar('/auth/login', { metodo: 'POST', corpo: { email: 'mara@teste.com', senha: 'senha1234' } });
  const loginNovaMara = await chamar('/auth/login', { metodo: 'POST', corpo: { email: 'mara@teste.com', senha: 'novaSenha99' } });
  checar('apos a troca, a senha antiga nao funciona e a nova funciona',
    loginAntigaMara.status === 401 && loginNovaMara.status === 200);

  const outroAparelho = await chamar('/conta', { token: tokenOutroAparelho });
  const tokenDaTrocaAntigo = await chamar('/conta', { token: mara.token });
  checar('as outras sessoes deixam de valer', outroAparelho.status === 401 && tokenDaTrocaAntigo.status === 401);

  const mesmaSessao = await chamar('/conta', { token: troca.dados.token });
  const mesmaSessaoServicos = await chamar('/servicos', { token: troca.dados.token });
  checar('a sessao em que a troca foi feita continua ativa (com o token devolvido)',
    mesmaSessao.status === 200 && mesmaSessaoServicos.status === 200);

  servidor.close();
  await sequelize.close();

  console.log(`\n${passou} criterios passaram, ${falhou} falharam.\n`);
  process.exit(falhou ? 1 : 0);
}

rodar().catch((e) => {
  console.error('Erro ao rodar os testes:', e);
  process.exit(1);
});
