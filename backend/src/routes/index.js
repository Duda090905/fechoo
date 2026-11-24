const { Router } = require('express');
const auth = require('../controllers/authController');
const conta = require('../controllers/contaController');
const prestador = require('../controllers/prestadorController');
const catalogo = require('../controllers/catalogoController');
const servico = require('../controllers/servicoController');
const pagamento = require('../controllers/pagamentoController');
const notificacao = require('../controllers/notificacaoController');
const execucao = require('../controllers/execucaoController');
const avaliacao = require('../controllers/avaliacaoController');
const disputa = require('../controllers/disputaController');
const admin = require('../controllers/adminController');
const extrato = require('../controllers/extratoController');
const { autenticar, apenasPerfil, exigirAtivo } = require('../middlewares/auth');
const { receberFoto, receberFotosPedido, receberImagemChat } = require('../middlewares/upload');

const rotas = Router();

rotas.get('/', (req, res) => res.json({ api: 'Fecho', sprint: 5 }));

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
// US24 - avaliacoes publicadas de um prestador (publico)
rotas.get('/prestadores/:id/avaliacoes', avaliacao.doPrestador);

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
// US22 - extrato do prestador (e exportacao em CSV)
rotas.get('/prestadores/extrato', autenticar, exigirAtivo, apenasPerfil('prestador'), extrato.extrato);
rotas.get('/prestadores/extrato.csv', autenticar, exigirAtivo, apenasPerfil('prestador'), extrato.extratoCsv);
// US06 - chave Pix e selo de identidade verificada
rotas.put('/prestadores/chave-pix', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.cadastrarChavePix);

// US10 - pedido e orcamento; US13 - data, hora e agenda; US12 - chat
rotas.post('/servicos', autenticar, exigirAtivo, apenasPerfil('contratante'), receberFotosPedido, servico.criar);
rotas.get('/servicos', autenticar, exigirAtivo, servico.listar);
rotas.get('/servicos/agenda', autenticar, exigirAtivo, servico.agenda);
// US16 - historico do contratante e "chamar de novo"
rotas.get('/servicos/historico', autenticar, exigirAtivo, apenasPerfil('contratante'), servico.historico);
rotas.get('/servicos/:id', autenticar, exigirAtivo, servico.detalhar);
rotas.post('/servicos/:id/orcamento', autenticar, exigirAtivo, apenasPerfil('prestador'), servico.enviarOrcamento);
rotas.post('/servicos/:id/recusar', autenticar, exigirAtivo, apenasPerfil('contratante'), servico.recusar);
// US11 / US17 - aceite do orcamento: gera o Pix; vira Aceito quando o Pix cai (US18)
rotas.post('/servicos/:id/aceitar', autenticar, exigirAtivo, apenasPerfil('contratante'), servico.aceitar);
// US20 - Cheguei, iniciar, concluir (prestador) e confirmar (contratante)
rotas.post('/servicos/:id/cheguei', autenticar, exigirAtivo, execucao.cheguei);
rotas.post('/servicos/:id/iniciar', autenticar, exigirAtivo, execucao.iniciar);
rotas.post('/servicos/:id/concluir', autenticar, exigirAtivo, execucao.concluir);
rotas.post('/servicos/:id/confirmar', autenticar, exigirAtivo, execucao.confirmar);
// US15 - quanto cada um recebe e o cancelamento
rotas.get('/servicos/:id/cancelamento', autenticar, exigirAtivo, execucao.previaCancelamento);
rotas.post('/servicos/:id/cancelar', autenticar, exigirAtivo, execucao.cancelar);
// US14 - nova data com aceite da outra parte
rotas.post('/servicos/:id/reagendamentos', autenticar, exigirAtivo, execucao.proporReagendamento);
rotas.post('/servicos/:id/reagendamentos/:rid/responder', autenticar, exigirAtivo, execucao.responderReagendamento);
// US24 - avaliacao mutua
rotas.post('/servicos/:id/avaliacao', autenticar, exigirAtivo, avaliacao.avaliar);
rotas.put('/servicos/:id/avaliacao', autenticar, exigirAtivo, avaliacao.editar);
rotas.post('/servicos/:id/avaliacao/resposta', autenticar, exigirAtivo, avaliacao.responder);
// US23 - disputa (o cliente abre; o profissional se defende)
rotas.post('/servicos/:id/disputa', autenticar, exigirAtivo, receberFotosPedido, disputa.abrirDisputa);
rotas.post('/servicos/:id/disputa/defesa', autenticar, exigirAtivo, receberFotosPedido, disputa.defenderDisputa);
// US19 - proposta complementar (foto obrigatoria)
rotas.post('/servicos/:id/complementar', autenticar, exigirAtivo, receberFoto, disputa.proporComplementar);
rotas.post('/servicos/:id/complementar/aceitar', autenticar, exigirAtivo, disputa.aceitarComplementar);
rotas.post('/servicos/:id/complementar/recusar', autenticar, exigirAtivo, disputa.recusarComplementar);
rotas.get('/servicos/:id/arquivos/:nome', autenticar, exigirAtivo, servico.arquivo);
rotas.get('/servicos/:id/mensagens', autenticar, exigirAtivo, servico.mensagens);
rotas.post('/servicos/:id/mensagens', autenticar, exigirAtivo, receberImagemChat, servico.enviarMensagem);

// US11 / US18 - avisos dentro do app
rotas.get('/notificacoes', autenticar, exigirAtivo, notificacao.listar);
rotas.post('/notificacoes/lidas', autenticar, exigirAtivo, notificacao.marcarLidas);

// US25 - painel do administrador (so o perfil administrador entra)
const soAdmin = [autenticar, exigirAtivo, apenasPerfil('administrador')];
rotas.get('/admin/disputas', ...soAdmin, admin.fila);
rotas.get('/admin/disputas/:id', ...soAdmin, admin.detalhe);
rotas.get('/admin/disputas/:id/arquivos/:nome', ...soAdmin, admin.arquivo);
rotas.post('/admin/disputas/:id/decisao', ...soAdmin, admin.decidir);
rotas.get('/admin/prestadores', ...soAdmin, admin.prestadores);
rotas.patch('/admin/prestadores/:id/suspensao', ...soAdmin, admin.suspensao);
rotas.get('/admin/acoes', ...soAdmin, admin.acoes);
rotas.get('/admin/relatorio', ...soAdmin, admin.relatorio);

module.exports = rotas;
