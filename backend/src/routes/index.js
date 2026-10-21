const { Router } = require('express');
const auth = require('../controllers/authController');
const conta = require('../controllers/contaController');
const prestador = require('../controllers/prestadorController');
const catalogo = require('../controllers/catalogoController');
const servico = require('../controllers/servicoController');
const pagamento = require('../controllers/pagamentoController');
const notificacao = require('../controllers/notificacaoController');
const { autenticar, apenasPerfil, exigirAtivo } = require('../middlewares/auth');
const { receberFoto, receberFotosPedido, receberImagemChat } = require('../middlewares/upload');

const rotas = Router();

rotas.get('/', (req, res) => res.json({ api: 'Fecho', sprint: 3 }));

// US01, US02, US03
rotas.post('/auth/register', auth.cadastrar);
rotas.post('/auth/login', auth.entrar);
rotas.post('/auth/esqueci-senha', auth.esqueciSenha);
rotas.post('/auth/redefinir-senha', auth.redefinirSenha);

// US05 - listas fixas
rotas.get('/catalogo/areas', catalogo.areasComCategorias);
rotas.get('/catalogo/bairros', catalogo.bairros);

// US09 - busca publica por categoria e bairro
rotas.get('/prestadores', prestador.listar);

// US18 - aviso do gateway (Asaas). Sem login: vale o token do cabecalho.
rotas.post('/pagamentos/webhook', pagamento.webhook);

// Rotas protegidas
rotas.get('/conta', autenticar, conta.meusDados);
rotas.get('/conta/pendencias', autenticar, conta.pendencias);
rotas.delete('/conta', autenticar, exigirAtivo, conta.desativar);
rotas.post('/conta/reativar', autenticar, conta.reativar);
rotas.delete('/conta/definitiva', autenticar, conta.excluirDefinitivo);
// US26 (curinga CC06)
rotas.put('/conta/senha', autenticar, exigirAtivo, conta.trocarSenha);

rotas.get('/prestadores/meu-perfil', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.meuPerfil);
rotas.put('/prestadores/meu-perfil', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.salvarPerfil);
rotas.put('/prestadores/foto', autenticar, exigirAtivo, apenasPerfil('prestador'), receberFoto, prestador.enviarFoto);
rotas.delete('/prestadores/foto', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.removerFoto);
rotas.patch('/prestadores/pausa', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.alternarPausa);
// US06 - chave Pix e selo de identidade verificada
rotas.put('/prestadores/chave-pix', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.cadastrarChavePix);

// US10 - pedido e orcamento; US13 - data, hora e agenda; US12 - chat
rotas.post('/servicos', autenticar, exigirAtivo, apenasPerfil('contratante'), receberFotosPedido, servico.criar);
rotas.get('/servicos', autenticar, exigirAtivo, servico.listar);
rotas.get('/servicos/agenda', autenticar, exigirAtivo, servico.agenda);
rotas.get('/servicos/:id', autenticar, exigirAtivo, servico.detalhar);
rotas.post('/servicos/:id/orcamento', autenticar, exigirAtivo, apenasPerfil('prestador'), servico.enviarOrcamento);
rotas.post('/servicos/:id/recusar', autenticar, exigirAtivo, apenasPerfil('contratante'), servico.recusar);
// US11 / US17 - aceite do orcamento: gera o Pix; vira Aceito quando o Pix cai (US18)
rotas.post('/servicos/:id/aceitar', autenticar, exigirAtivo, apenasPerfil('contratante'), servico.aceitar);
rotas.get('/servicos/:id/arquivos/:nome', autenticar, exigirAtivo, servico.arquivo);
rotas.get('/servicos/:id/mensagens', autenticar, exigirAtivo, servico.mensagens);
rotas.post('/servicos/:id/mensagens', autenticar, exigirAtivo, receberImagemChat, servico.enviarMensagem);

// US11 / US18 - avisos dentro do app
rotas.get('/notificacoes', autenticar, exigirAtivo, notificacao.listar);
rotas.post('/notificacoes/lidas', autenticar, exigirAtivo, notificacao.marcarLidas);

module.exports = rotas;
