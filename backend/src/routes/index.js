const { Router } = require('express');
const auth = require('../controllers/authController');
const conta = require('../controllers/contaController');
const prestador = require('../controllers/prestadorController');
const catalogo = require('../controllers/catalogoController');
const { autenticar, apenasPerfil, exigirAtivo } = require('../middlewares/auth');
const { receberFoto } = require('../middlewares/upload');

const rotas = Router();

rotas.get('/', (req, res) => res.json({ api: 'Fecho', sprint: 1 }));

// US01, US02, US03
rotas.post('/auth/register', auth.cadastrar);
rotas.post('/auth/login', auth.entrar);
rotas.post('/auth/esqueci-senha', auth.esqueciSenha);
rotas.post('/auth/redefinir-senha', auth.redefinirSenha);

// US05 - listas fixas
rotas.get('/catalogo/areas', catalogo.areasComCategorias);
rotas.get('/catalogo/bairros', catalogo.bairros);

// Listagem publica (base da US09)
rotas.get('/prestadores', prestador.listar);

// Rotas protegidas
rotas.get('/conta', autenticar, conta.meusDados);
rotas.get('/conta/pendencias', autenticar, conta.pendencias);
rotas.delete('/conta', autenticar, exigirAtivo, conta.desativar);
rotas.post('/conta/reativar', autenticar, conta.reativar);
rotas.delete('/conta/definitiva', autenticar, conta.excluirDefinitivo);

rotas.get('/prestadores/meu-perfil', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.meuPerfil);
rotas.put('/prestadores/meu-perfil', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.salvarPerfil);
rotas.put('/prestadores/foto', autenticar, exigirAtivo, apenasPerfil('prestador'), receberFoto, prestador.enviarFoto);
rotas.delete('/prestadores/foto', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.removerFoto);
rotas.patch('/prestadores/pausa', autenticar, exigirAtivo, apenasPerfil('prestador'), prestador.alternarPausa);

module.exports = rotas;
