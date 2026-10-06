/**
 * Verificacao dos criterios de aceite do Sprint 1.
 * Sobe a API em memoria (sqlite) e chama os endpoints de verdade.
 *
 * Rodar com: npm run teste
 */
process.env.DB_DIALECT = 'sqlite';
process.env.JWT_SECRET = 'chave-de-teste';
// Fotos de teste vao para uma pasta temporaria, nunca para backend/uploads.
process.env.UPLOADS_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'fecho-uploads-'));

const { sequelize, Area, Categoria, Bairro, Prestador, Pausa, SolicitacaoExclusao } = require('../src/models');
const app = require('../src/app');

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
  // Link de troca de senha pedido antes de apagar: nao pode servir depois.
  await TokenSenha.create({
    usuario_id: salvo.id, token_hash: hashDeToken('link-de-antes-de-apagar'), expira_em: new Date(Date.now() + 30 * 60000)
  });
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

  console.log('\nUS04 - Um CPF, uma conta: quem apaga os dados e volta reabre a mesma conta');
  checar('o cadastro ja grava a impressao do CPF (64 caracteres), nao o numero',
    typeof salvo.cpf_hash === 'string' && salvo.cpf_hash.length === 64 && !salvo.cpf_hash.includes(CONTRATANTE.cpf));
  checar('apagar os dados tira o CPF, mas guarda a impressao',
    anonimizado.cpf === null && typeof anonimizado.cpf_hash === 'string' && anonimizado.cpf_hash === salvo.cpf_hash);

  const voltou = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, nome: 'Ana Souza Nova', email: 'ana.nova@teste.com' }
  });
  checar('cadastro com o mesmo CPF e aceito e avisa que a conta foi reaberta',
    voltou.status === 201 && voltou.dados.historico_recuperado === true && Boolean(voltou.dados.aviso));
  checar('volta para a MESMA conta (mesmo id), e nao para uma conta nova',
    voltou.dados.usuario.id === salvo.id && await Usuario.count({ where: { cpf_hash: salvo.cpf_hash } }) === 1);

  const reaberta = await Usuario.findByPk(salvo.id);
  checar('a conta reaberta fica ativa, com os dados novos e o CPF de volta',
    reaberta.status === 'ativo' && reaberta.nome === 'Ana Souza Nova' && reaberta.email === 'ana.nova@teste.com'
    && reaberta.cpf === CONTRATANTE.cpf && reaberta.excluido_em === null);
  checar('os dados pessoais antigos nao voltam (foram apagados a pedido)',
    reaberta.nome !== CONTRATANTE.nome && reaberta.email !== CONTRATANTE.email);
  checar('o historico continua ligado a mesma conta (pedidos de saida anteriores)',
    await SolicitacaoExclusao.count({ where: { usuario_id: salvo.id } }) === 4);

  const tokenDeAntes = await chamar('/conta', { token: tokenInativa });
  checar('token de antes da exclusao nao volta a valer com a conta reaberta', tokenDeAntes.status === 401);
  const linkDeAntes = await chamar('/auth/redefinir-senha', {
    metodo: 'POST', corpo: { token: 'link-de-antes-de-apagar', senha: 'outrasenha1' }
  });
  checar('link de troca de senha de antes da exclusao nao funciona depois', linkDeAntes.status === 400);
  const entraDeNovo = await chamar('/auth/login', {
    metodo: 'POST', corpo: { email: 'ana.nova@teste.com', senha: CONTRATANTE.senha }
  });
  checar('entra na conta reaberta com o e-mail e a senha novos', entraDeNovo.status === 200 && entraDeNovo.dados.usuario.id === salvo.id);

  const repetidoDepois = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, email: 'ana.terceira@teste.com' }
  });
  checar('com a conta reaberta, o mesmo CPF volta a ser recusado', repetidoDepois.status === 409);

  const outroCpf = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, cpf: '71428793860', email: 'semhistorico@teste.com' }
  });
  checar('CPF diferente cria conta nova, sem historico', outroCpf.status === 201 && outroCpf.dados.historico_recuperado === false
    && outroCpf.dados.usuario.id !== salvo.id);

  // Banimento: a tela e a US25; a regra ja vale aqui.
  const BANIDO = {
    nome: 'Beto Banido', cpf: '25834617026', email: 'beto@teste.com', telefone: '19999990000',
    senha: 'senha1234', tipo_perfil: 'contratante', aceite_termos: true
  };
  const cadBanido = await chamar('/auth/register', { metodo: 'POST', corpo: BANIDO });
  await chamar('/conta', { metodo: 'DELETE', token: cadBanido.dados.token, corpo: { confirmacao: 'DESATIVAR' } });
  await chamar('/conta/definitiva', { metodo: 'DELETE', token: cadBanido.dados.token, corpo: { confirmacao: 'APAGAR MEUS DADOS' } });
  await Usuario.update({ bloqueado_novo_cadastro: true }, { where: { id: cadBanido.dados.usuario.id } });
  const voltaBanido = await chamar('/auth/register', { metodo: 'POST', corpo: { ...BANIDO, email: 'beto2@teste.com' } });
  checar('CPF banido nao reabre a conta nem cria outra', voltaBanido.status === 403
    && await Usuario.count({ where: { email: 'beto2@teste.com' } }) === 0);

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

  const liaVolta = await chamar('/auth/register', { metodo: 'POST', corpo: { ...LIA, email: 'lia.nova@teste.com' } });
  checar('prestadora que apagou os dados reabre a mesma conta, com o perfil vazio',
    liaVolta.status === 201 && liaVolta.dados.usuario.id === cadLia.dados.usuario.id
    && (await chamar('/prestadores/meu-perfil', { token: liaVolta.dados.token })).dados.prestador.categorias.length === 0);
  await chamar('/prestadores/meu-perfil', {
    metodo: 'PUT', token: liaVolta.dados.token, corpo: { categorias: [idsCategorias[0]], bairros: [bairro.id] }
  });
  const listaComLia = await chamar('/prestadores');
  const pausaLia = await chamar('/prestadores/pausa', { metodo: 'PATCH', token: liaVolta.dados.token });
  checar('o perfil reaberto volta a aparecer e pode ser pausado (nao fica preso como suspenso)',
    listaComLia.dados.prestadores.some((p) => p.nome === LIA.nome) && pausaLia.status === 200);

  servidor.close();
  await sequelize.close();

  console.log(`\n${passou} criterios passaram, ${falhou} falharam.\n`);
  process.exit(falhou ? 1 : 0);
}

rodar().catch((e) => {
  console.error('Erro ao rodar os testes:', e);
  process.exit(1);
});
