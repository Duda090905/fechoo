/**
 * Verificacao dos criterios de aceite do Sprint 1.
 * Sobe a API em memoria (sqlite) e chama os endpoints de verdade.
 *
 * Rodar com: npm run teste
 */
process.env.DB_DIALECT = 'sqlite';
process.env.JWT_SECRET = 'chave-de-teste';

const { sequelize, Area, Categoria, Bairro } = require('../src/models');
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

const CONTRATANTE = {
  nome: 'Ana Souza', cpf: '52998224725', email: 'ana@teste.com',
  senha: 'senha1234', tipo_perfil: 'contratante', sexo: 'feminino', aceite_termos: true
};
const PRESTADORA = {
  nome: 'Rita Lima', cpf: '11144477735', email: 'rita@teste.com',
  senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
};
const PRESTADOR = {
  nome: 'Joao Alves', cpf: '15350946056', email: 'joao@teste.com',
  senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'masculino', aceite_termos: true
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

  // Prestadores incompletos: nao podem aparecer em nenhuma busca.
  const SEM_CATEGORIA = {
    nome: 'Paulo Sem Categoria', cpf: '39053344705', email: 'paulo@teste.com',
    senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'masculino', aceite_termos: true
  };
  const SEM_BAIRRO = {
    nome: 'Bia Sem Bairro', cpf: '86288366757', email: 'bia@teste.com',
    senha: 'senha1234', tipo_perfil: 'prestador', sexo: 'feminino', aceite_termos: true
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

  const nomesPorCategoria = (await chamar(`/prestadores?categoria=${idsCategorias[0]}`)).dados.prestadores.map((p) => p.nome);
  checar('prestador sem bairro nao aparece nem filtrando pela categoria dele',
    !nomesPorCategoria.includes(SEM_BAIRRO.nome));

  const nomesPorBairro = (await chamar(`/prestadores?bairro=${bairro.id}`)).dados.prestadores.map((p) => p.nome);
  checar('prestador sem categoria nao aparece nem filtrando pelo bairro dele',
    !nomesPorBairro.includes(SEM_CATEGORIA.nome));

  const filtrada = (await chamar(`/prestadores?categoria=${idsCategorias[0]}`)).dados.prestadores;
  checar('filtrar por categoria nao esconde as outras categorias do cartao',
    filtrada.length === 1 && filtrada[0].categorias.length === 2);

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

  const porCategoria = await chamar(`/prestadores?categoria=${idsCategorias[2]}`);
  checar('filtro por categoria traz so quem atende aquela categoria', porCategoria.dados.prestadores.length === 1);

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

  const usoIndevido = await chamar('/conta', { metodo: 'PUT', token: tokenInativa, corpo: { nome: 'Nova' } });
  checar('conta inativa nao usa o resto da plataforma', usoIndevido.status === 403);

  const volta = await chamar('/conta/reativar', { metodo: 'POST', token: tokenInativa });
  checar('reativa e recupera os dados anteriores',
    volta.status === 200 && volta.dados.usuario.nome === CONTRATANTE.nome);

  const depoisDeVoltar = await chamar('/conta', { metodo: 'PUT', token: tokenInativa, corpo: { nome: CONTRATANTE.nome } });
  checar('apos reativar, volta a usar a plataforma', depoisDeVoltar.status === 200);

  const apagarAtiva = await chamar('/conta/definitiva', {
    metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'APAGAR MEUS DADOS' }
  });
  checar('so apaga os dados depois de desativar', apagarAtiva.status === 409);

  await chamar('/conta', { metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'DESATIVAR' } });
  const apagou = await chamar('/conta/definitiva', {
    metodo: 'DELETE', token: tokenInativa, corpo: { confirmacao: 'APAGAR MEUS DADOS' }
  });
  checar('apaga os dados em definitivo', apagou.status === 200);

  const anonimizado = await Usuario.findOne({ where: { id: salvo.id } });
  checar('dados pessoais anonimizados no banco',
    anonimizado.email === null && anonimizado.cpf === null && anonimizado.nome === 'Usuario removido');
  checar('guarda apenas o hash do CPF, para reconhecer reincidencia',
    typeof anonimizado.cpf_hash === 'string' && anonimizado.cpf_hash.length === 64);

  const tokenAntigo = await chamar('/conta', { token: tokenInativa });
  checar('token antigo deixa de funcionar apos apagar os dados', tokenAntigo.status === 401);

  console.log('\nUS04 - Voltar depois de apagar os dados');
  const { idsDaPessoa } = require('../src/servicos/historico');

  const voltou = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, nome: 'Ana Souza Nova', email: 'ana.nova@teste.com' }
  });
  checar('permite criar conta nova com o mesmo CPF depois de apagar', voltou.status === 201);
  checar('avisa que encontrou o cadastro anterior', voltou.dados.historico_recuperado === true);

  const contaNova = await Usuario.findOne({ where: { email: 'ana.nova@teste.com' } });
  checar('a conta nova nasce ligada a antiga', contaNova.conta_anterior_id === salvo.id);

  const corrente = await idsDaPessoa(contaNova.id);
  checar('a corrente de contas devolve as duas', corrente.length === 2 && corrente.includes(salvo.id));

  checar('os dados pessoais antigos NAO voltaram',
    contaNova.nome === 'Ana Souza Nova' && contaNova.email === 'ana.nova@teste.com');

  const outroCpf = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, cpf: '12345678909', email: 'semhistorico@teste.com' }
  });
  const semHistorico = await Usuario.findOne({ where: { email: 'semhistorico@teste.com' } });
  checar('CPF diferente cria conta limpa, sem vinculo',
    outroCpf.status === 201 && semHistorico.conta_anterior_id === null);

  // Banimento pela administracao. A tela e a US25; a regra ja vive aqui.
  const { impressaoCpf } = require('../src/utils/cpf');
  contaNova.status = 'excluido';
  contaNova.cpf = null;
  contaNova.email = null;
  contaNova.cpf_hash = impressaoCpf(CONTRATANTE.cpf);
  contaNova.bloqueado_novo_cadastro = true;
  await contaNova.save();

  const tentativaBanida = await chamar('/auth/register', {
    metodo: 'POST', corpo: { ...CONTRATANTE, nome: 'Terceira tentativa', email: 'terceira@teste.com' }
  });
  checar('CPF banido nao cria conta nova nem depois de apagar', tentativaBanida.status === 403);

  servidor.close();
  await sequelize.close();

  console.log(`\n${passou} criterios passaram, ${falhou} falharam.\n`);
  process.exit(falhou ? 1 : 0);
}

rodar().catch((e) => {
  console.error('Erro ao rodar os testes:', e);
  process.exit(1);
});
