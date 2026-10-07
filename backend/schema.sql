-- Fecho - Sprint 2
-- Este arquivo e uma referencia do modelo. A aplicacao cria as tabelas
-- sozinha ao iniciar (sequelize.sync). Use este script se preferir
-- criar o banco manualmente antes de rodar a API.

CREATE DATABASE IF NOT EXISTS fecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fecho;

-- US01, US02, US03, US04
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  email VARCHAR(160) UNIQUE,
  telefone VARCHAR(20),
  senha_hash VARCHAR(120),
  sexo ENUM('feminino','masculino','nao_informado') DEFAULT 'nao_informado',
  tipo_perfil ENUM('contratante','prestador') NOT NULL,
  -- inativo: desativada pela propria pessoa; excluido: dados apagados (LGPD)
  status ENUM('ativo','inativo','excluido') DEFAULT 'ativo',
  aceite_termos BOOLEAN DEFAULT FALSE,
  aceite_termos_em DATETIME,
  -- sobe a cada troca de senha e encerra as sessoes anteriores
  token_versao INT NOT NULL DEFAULT 0,
  -- retencao de conta inativa: o relogio dos 12 meses conta do mais recente entre
  -- desativado_em e ultimo_acesso_em; aviso_retencao_em marca o envio do e-mail de aviso
  ultimo_acesso_em DATETIME,
  aviso_retencao_em DATETIME,
  desativado_em DATETIME,
  reativado_em DATETIME,
  excluido_em DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_usuarios_status (status)
);

-- US05
CREATE TABLE areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(60) NOT NULL UNIQUE,
  ordem INT DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(60) NOT NULL UNIQUE,
  area_id INT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (area_id) REFERENCES areas(id)
);

CREATE TABLE bairros (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(80) NOT NULL,
  cidade VARCHAR(80) DEFAULT 'Campinas',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_bairros_nome (nome)
);

-- US05, US07, US08
CREATE TABLE prestadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL UNIQUE,
  descricao TEXT,
  -- caminho da foto enviada (/uploads/perfis/<nome>), nunca endereco externo
  foto_url VARCHAR(255),
  status ENUM('ativo','pausado','suspenso') DEFAULT 'ativo',
  pausado_em DATETIME,
  atende_apenas_mulheres BOOLEAN DEFAULT FALSE,
  -- US09: a busca ordena pela nota e o cartao a exibe; quem calcula e a US24
  nota_media DECIMAL(3,2),
  -- US09: selo no cartao da busca; quem verifica e a US06
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  -- US09: indice do filtro de status da busca
  INDEX idx_prestadores_status (status)
);

CREATE TABLE prestador_categorias (
  prestador_id INT NOT NULL,
  categoria_id INT NOT NULL,
  PRIMARY KEY (prestador_id, categoria_id),
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  -- US09: indice do filtro de categoria da busca
  INDEX idx_prestador_categorias_categoria (categoria_id, prestador_id)
);

CREATE TABLE prestador_bairros (
  prestador_id INT NOT NULL,
  bairro_id INT NOT NULL,
  PRIMARY KEY (prestador_id, bairro_id),
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY (bairro_id) REFERENCES bairros(id),
  -- US09: indice do filtro de bairro da busca
  INDEX idx_prestador_bairros_bairro (bairro_id, prestador_id)
);

-- US07: um registro por pausa; fim vazio = pausa em andamento
CREATE TABLE pausas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prestador_id INT NOT NULL,
  inicio DATETIME NOT NULL,
  fim DATETIME,
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  INDEX idx_pausas_prestador (prestador_id)
);

-- US03
CREATE TABLE tokens_senha (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  token_hash VARCHAR(120) NOT NULL,
  expira_em DATETIME NOT NULL,
  usado_em DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- US04: data (created_at), origem e resultado de cada pedido para sair.
-- Guarda so o id, sem dado pessoal, entao sobrevive a anonimizacao.
CREATE TABLE solicitacoes_exclusao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  tipo ENUM('desativacao','exclusao_dados') NOT NULL,
  origem ENUM('painel_usuario','rotina_automatica') NOT NULL DEFAULT 'painel_usuario',
  resultado ENUM('concluida','recusada_pendencia') NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_solicitacoes_usuario (usuario_id)
);

-- US10: pedido de servico e orcamento; US13: data e hora; US12: encerramento e midias.
-- Os tres primeiros status sao os da US10; os demais sao da maquina de estados
-- e passam a ser usados pelas proximas historias.
CREATE TABLE servicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_contratante INT NOT NULL,
  id_prestador INT NOT NULL,
  -- bairro onde o servico sera feito: define se cabe taxa de deslocamento
  bairro_id INT NOT NULL,
  descricao TEXT NOT NULL,
  -- nomes dos arquivos das fotos do pedido (pasta privada uploads/servicos)
  fotos JSON,
  data_hora_solicitada DATETIME NOT NULL,
  data_hora_proposta DATETIME,
  valor DECIMAL(10,2),
  -- duracao estimada em horas: ocupa a agenda do prestador (US13)
  prazo_horas INT,
  taxa_deslocamento DECIMAL(10,2),
  status ENUM('aguardando_orcamento','orcamento_enviado','recusado','aceito','em_execucao','concluido',
    'confirmado','pago','cancelado','em_disputa','resolvido','expirado') NOT NULL DEFAULT 'aguardando_orcamento',
  orcamento_enviado_em DATETIME,
  -- quando encerrou: o chat fecha e conta o prazo de guarda das midias
  encerrado_em DATETIME,
  midias_removidas_em DATETIME,
  lembrete_enviado_em DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (id_contratante) REFERENCES usuarios(id),
  FOREIGN KEY (id_prestador) REFERENCES prestadores(id),
  FOREIGN KEY (bairro_id) REFERENCES bairros(id)
);

-- US12: mensagens do chat, sem edicao nem exclusao pelo usuario
CREATE TABLE mensagens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  servico_id INT NOT NULL,
  autor_id INT NOT NULL,
  texto TEXT,
  -- nome do arquivo na pasta privada uploads/servicos
  imagem VARCHAR(64),
  imagem_removida_em DATETIME,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE RESTRICT,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id)
);
