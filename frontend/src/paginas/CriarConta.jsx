import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../servicos/api';
import { useAuth } from '../contexto/AuthContexto';
import Campo from '../componentes/Campo';
import Botao from '../componentes/Botao';
import Aviso from '../componentes/Aviso';
import MolduraAuth from '../componentes/MolduraAuth';
import { cpfValido, formatarCpf, formatarTelefone, telefoneValido } from '../utils/formatos';

const INICIAL = {
  nome: '', cpf: '', email: '', telefone: '',
  senha: '', confirmacao: '', tipo_perfil: 'contratante', sexo: 'nao_informado'
};

export default function CriarConta() {
  const [form, setForm] = useState(INICIAL);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cpfTocado, setCpfTocado] = useState(false);
  // US04 - quem apagou os dados e voltou com o mesmo CPF reabre a mesma conta.
  const [reaberta, setReaberta] = useState(null);
  const { autenticar } = useAuth();
  const navegar = useNavigate();

  function mudar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function entrarNaConta(dados) {
    autenticar(dados.token, dados.usuario);
    navegar(dados.usuario.tipo_perfil === 'prestador' ? '/meu-perfil' : '/prestadores');
  }

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');

    if (!cpfValido(form.cpf)) {
      setErro('Esse CPF não é válido. Confira os números.');
      setCpfTocado(true);
      return;
    }
    if (!telefoneValido(form.telefone)) {
      setErro('Informe o telefone com DDD, por exemplo (19) 99999-9999.');
      return;
    }
    if (form.senha !== form.confirmacao) {
      setErro('As duas senhas precisam ser iguais.');
      return;
    }
    if (!aceite) {
      setErro('É preciso aceitar os termos para criar a conta.');
      return;
    }

    setEnviando(true);
    try {
      const dados = await api.cadastrar({ ...form, aceite_termos: true });
      if (dados.historico_recuperado) {
        setReaberta(dados);
        return;
      }
      entrarNaConta(dados);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MolduraAuth
      titulo="Criar conta"
      subtitulo="Leva menos de um minuto."
      rodape={<p className="rodape-form">Já tem conta? <Link to="/entrar">Entrar</Link></p>}
    >
      {reaberta ? (
        <div>
          <Aviso tipo="neutro">{reaberta.aviso}</Aviso>
          <Botao type="button" onClick={() => entrarNaConta(reaberta)}>Continuar</Botao>
        </div>
      ) : (
        <form onSubmit={enviar}>
          <Aviso>{erro}</Aviso>

          <Campo etiqueta="Eu quero">
            <select value={form.tipo_perfil} onChange={(e) => mudar('tipo_perfil', e.target.value)}>
              <option value="contratante">Contratar um serviço</option>
              <option value="prestador">Oferecer meus serviços</option>
            </select>
          </Campo>

          <Campo etiqueta="Nome completo" value={form.nome} onChange={(e) => mudar('nome', e.target.value)} required />
          <Campo
            etiqueta="CPF"
            value={form.cpf}
            onChange={(e) => mudar('cpf', formatarCpf(e.target.value))}
            onBlur={() => setCpfTocado(true)}
            erro={cpfTocado && form.cpf && !cpfValido(form.cpf) ? 'Esse CPF não é válido.' : ''}
            inputMode="numeric"
            placeholder="000.000.000-00"
            autoComplete="off"
            required
          />
          <Campo etiqueta="E-mail" type="email" value={form.email} onChange={(e) => mudar('email', e.target.value)} required />
          <Campo
            etiqueta="Telefone"
            value={form.telefone}
            onChange={(e) => mudar('telefone', formatarTelefone(e.target.value))}
            inputMode="tel"
            placeholder="(19) 99999-9999"
            autoComplete="tel"
            required
          />

          <Campo etiqueta="Sexo" ajuda="Opcional. Usado apenas no filtro de segurança entre mulheres.">
            <select value={form.sexo} onChange={(e) => mudar('sexo', e.target.value)}>
              <option value="nao_informado">Prefiro não informar</option>
              <option value="feminino">Feminino</option>
              <option value="masculino">Masculino</option>
            </select>
          </Campo>

          <Campo etiqueta="Senha" type="password" value={form.senha} onChange={(e) => mudar('senha', e.target.value)} ajuda="Mínimo de 8 caracteres, com letra e número." required />
          <Campo etiqueta="Repita a senha" type="password" value={form.confirmacao} onChange={(e) => mudar('confirmacao', e.target.value)} required />

          <label className="linha" style={{ marginBottom: 18, alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} style={{ marginTop: 4 }} />
            <span style={{ fontSize: 14, color: 'var(--texto-suave)' }}>
              Li e aceito os termos de uso e autorizo o tratamento dos meus dados conforme a LGPD.
              Se eu desativar a conta e ficar 12 meses sem voltar, meus dados pessoais serão apagados.
              Mesmo depois de apagados, o Fechô guarda um código gerado do meu CPF (que não permite descobrir o número),
              para que cada CPF tenha uma conta só.
            </span>
          </label>

          <Botao type="submit" carregando={enviando}>Criar conta</Botao>
        </form>
      )}
    </MolduraAuth>
  );
}
