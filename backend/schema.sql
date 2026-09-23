-- Fecho - Sprint 1
-- Este arquivo e uma referencia do modelo. A aplicacao cria as tabelas
-- sozinha ao iniciar (sequelize.sync). Use este script se preferir
-- criar o banco manualmente antes de rodar a API.

CREATE DATABASE IF NOT EXISTS fecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fecho;

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(120) NOT NULL,
  cpf VARCHAR(11) UNIQUE,
  email VARCHAR(160) UNIQUE,
  telefone VARCHAR(20),
  senha_hash VARCHAR(120),
  sexo ENUM('feminino','masculino','nao_informado') DEFAULT 'nao_informado',
  tipo_perfil ENUM('contratante','prestador','administrador') NOT NULL,
  status ENUM('ativo','suspenso','excluido') DEFAULT 'ativo',
  aceite_termos BOOLEAN DEFAULT FALSE,
  aceite_termos_em DATETIME,
  tentativas_login INT DEFAULT 0,
  bloqueado_ate DATETIME,
  excluido_em DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_usuarios_email (email),
  INDEX idx_usuarios_status (status)
);

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
  regiao VARCHAR(40),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_bairros_nome (nome)
);

CREATE TABLE prestadores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL UNIQUE,
  descricao TEXT,
  foto_url VARCHAR(255),
  status ENUM('ativo','pausado','suspenso') DEFAULT 'ativo',
  pausado_em DATETIME,
  atende_apenas_mulheres BOOLEAN DEFAULT FALSE,
  verificado BOOLEAN DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_prestadores_status (status)
);

CREATE TABLE prestador_categorias (
  prestador_id INT NOT NULL,
  categoria_id INT NOT NULL,
  PRIMARY KEY (prestador_id, categoria_id),
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

CREATE TABLE prestador_bairros (
  prestador_id INT NOT NULL,
  bairro_id INT NOT NULL,
  PRIMARY KEY (prestador_id, bairro_id),
  FOREIGN KEY (prestador_id) REFERENCES prestadores(id),
  FOREIGN KEY (bairro_id) REFERENCES bairros(id)
);

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
