-- Fecho - Sprints 1 a 5 (projeto completo)
-- Gerado a partir dos modelos (backend/src/models) no dialeto MySQL.
-- A aplicacao cria as tabelas sozinha ao iniciar (sequelize.sync + garantirColunas);
-- use este script se preferir criar o banco manualmente antes de rodar a API.
--
-- Sprint 5: disputas (US23/US25), propostas_complementares (US19),
-- acoes_administrador (US25), pagamentos.tipo (US19), prestadores.suspenso_em e
-- motivo_suspensao (US25) e o perfil 'administrador' em usuarios.tipo_perfil.

CREATE DATABASE IF NOT EXISTS fecho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fecho;

CREATE TABLE `usuarios` (
  `id` INTEGER auto_increment,
  `nome` VARCHAR(120) NOT NULL,
  `cpf` VARCHAR(11) UNIQUE,
  `email` VARCHAR(160) UNIQUE,
  `telefone` VARCHAR(20),
  `senha_hash` VARCHAR(120),
  `sexo` ENUM('feminino', 'masculino', 'nao_informado') DEFAULT 'nao_informado',
  `tipo_perfil` ENUM('contratante', 'prestador', 'administrador') NOT NULL,
  `status` ENUM('ativo', 'inativo', 'excluido') DEFAULT 'ativo',
  `aceite_termos` TINYINT(1) DEFAULT false,
  `aceite_termos_em` DATETIME,
  `token_versao` INTEGER NOT NULL DEFAULT 0,
  `ultimo_acesso_em` DATETIME,
  `aviso_retencao_em` DATETIME,
  `desativado_em` DATETIME,
  `reativado_em` DATETIME,
  `excluido_em` DATETIME,
  `asaas_cliente_id` VARCHAR(40),
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `prestadores` (
  `id` INTEGER auto_increment,
  `usuario_id` INTEGER NOT NULL UNIQUE,
  `descricao` TEXT,
  `foto_url` VARCHAR(255),
  `status` ENUM('ativo', 'pausado', 'suspenso') DEFAULT 'ativo',
  `pausado_em` DATETIME,
  `atende_apenas_mulheres` TINYINT(1) DEFAULT false,
  `nota_media` DECIMAL(3,2),
  `total_avaliacoes` INTEGER DEFAULT 0,
  `verificado` TINYINT(1) NOT NULL DEFAULT false,
  `chave_pix_tipo` VARCHAR(10),
  `chave_pix` VARCHAR(77),
  `verificado_em` DATETIME,
  `suspenso_em` DATETIME,
  `motivo_suspensao` VARCHAR(300),
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `prestadores` ADD INDEX `idx_prestadores_status` (`status`);

CREATE TABLE `bairros` (
  `id` INTEGER auto_increment,
  `nome` VARCHAR(80) NOT NULL,
  `cidade` VARCHAR(80) DEFAULT 'Campinas',
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `areas` (
  `id` INTEGER auto_increment,
  `nome` VARCHAR(60) NOT NULL UNIQUE,
  `ordem` INTEGER DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `categorias` (
  `id` INTEGER auto_increment,
  `nome` VARCHAR(60) NOT NULL UNIQUE,
  `area_id` INTEGER NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`area_id`) REFERENCES `areas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `servicos` (
  `id` INTEGER auto_increment,
  `id_contratante` INTEGER NOT NULL,
  `id_prestador` INTEGER NOT NULL,
  `bairro_id` INTEGER NOT NULL,
  `descricao` TEXT NOT NULL,
  `fotos` JSON,
  `data_hora_solicitada` DATETIME NOT NULL,
  `data_hora_proposta` DATETIME,
  `valor` DECIMAL(10,2),
  `prazo_horas` INTEGER,
  `taxa_deslocamento` DECIMAL(10,2),
  `status` ENUM('aguardando_orcamento', 'orcamento_enviado', 'recusado', 'aceito', 'em_execucao', 'concluido', 'confirmado', 'pago', 'cancelado', 'em_disputa', 'resolvido', 'expirado') NOT NULL DEFAULT 'aguardando_orcamento',
  `orcamento_enviado_em` DATETIME,
  `encerrado_em` DATETIME,
  `midias_removidas_em` DATETIME,
  `lembrete_enviado_em` DATETIME,
  `endereco` VARCHAR(200),
  `aceito_em` DATETIME,
  `categoria_id` INTEGER,
  `chegou_em` DATETIME,
  `iniciado_em` DATETIME,
  `concluido_em` DATETIME,
  `confirmado_em` DATETIME,
  `confirmacao_automatica` TINYINT(1),
  `pago_em` DATETIME,
  `cancelado_em` DATETIME,
  `cancelado_por_id` INTEGER,
  `cancelado_papel` VARCHAR(12),
  `motivo_cancelamento` VARCHAR(300),
  `regra_cancelamento` VARCHAR(30),
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`id_contratante`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`id_prestador`) REFERENCES `prestadores` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`bairro_id`) REFERENCES `bairros` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `acessos_endereco` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `usuario_id` INTEGER NOT NULL,
  `papel` ENUM('contratante', 'prestador') NOT NULL,
  `ip` VARCHAR(45),
  `acessado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `acessos_endereco` ADD INDEX `idx_acessos_endereco_servico` (`servico_id`);

CREATE TABLE `acoes_administrador` (
  `id` INTEGER auto_increment,
  `administrador_id` INTEGER NOT NULL,
  `acao` VARCHAR(30) NOT NULL,
  `alvo_tipo` VARCHAR(20) NOT NULL,
  `alvo_id` INTEGER NOT NULL,
  `justificativa` TEXT NOT NULL,
  `detalhe` VARCHAR(300),
  `registrado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`administrador_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `avaliacoes` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `autor_id` INTEGER NOT NULL,
  `avaliado_id` INTEGER NOT NULL,
  `papel_autor` ENUM('contratante', 'prestador') NOT NULL,
  `nota` INTEGER NOT NULL,
  `comentario` VARCHAR(500),
  `editavel_ate` DATETIME NOT NULL,
  `prazo_ate` DATETIME NOT NULL,
  `liberada_em` DATETIME,
  `resposta` VARCHAR(500),
  `respondida_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`avaliado_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `avaliacoes` ADD UNIQUE INDEX `uq_avaliacoes_servico_autor` (`servico_id`, `autor_id`);
ALTER TABLE `avaliacoes` ADD INDEX `idx_avaliacoes_avaliado` (`avaliado_id`);

CREATE TABLE `disputas` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL UNIQUE,
  `aberta_por_id` INTEGER NOT NULL,
  `status` ENUM('aberta', 'decidida') NOT NULL DEFAULT 'aberta',
  `status_servico_anterior` VARCHAR(30) NOT NULL,
  `justificativa` TEXT NOT NULL,
  `evidencias` JSON,
  `defesa` TEXT,
  `defesa_evidencias` JSON,
  `defesa_em` DATETIME,
  `decisao` ENUM('devolver', 'liberar', 'dividir'),
  `percentual_contratante` INTEGER,
  `valor_contratante` DECIMAL(10,2),
  `valor_prestador` DECIMAL(10,2),
  `justificativa_decisao` TEXT,
  `decidido_por_id` INTEGER,
  `decidido_em` DATETIME,
  `aberta_em` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`aberta_por_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`decidido_por_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `disputas` ADD INDEX `idx_disputas_status` (`status`);

CREATE TABLE `eventos_webhook` (
  `id` INTEGER auto_increment,
  `evento_id` VARCHAR(120) NOT NULL UNIQUE,
  `tipo` VARCHAR(60) NOT NULL,
  `cobranca_id` VARCHAR(60),
  `resultado` VARCHAR(40) NOT NULL,
  `recebido_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `historico_servicos` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `usuario_id` INTEGER,
  `acao` VARCHAR(40) NOT NULL,
  `status_anterior` VARCHAR(30),
  `status_novo` VARCHAR(30),
  `detalhe` VARCHAR(300),
  `registrado_em` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `historico_servicos` ADD INDEX `idx_historico_servicos_servico` (`servico_id`);

CREATE TABLE `mensagens` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `autor_id` INTEGER NOT NULL,
  `texto` TEXT,
  `imagem` VARCHAR(64),
  `imagem_removida_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (`autor_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `notificacoes` (
  `id` INTEGER auto_increment,
  `usuario_id` INTEGER NOT NULL,
  `servico_id` INTEGER NOT NULL,
  `tipo` VARCHAR(40) NOT NULL,
  `titulo` VARCHAR(120) NOT NULL,
  `texto` VARCHAR(500) NOT NULL,
  `lida_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `notificacoes` ADD UNIQUE INDEX `uq_notificacoes_usuario_servico_tipo` (`usuario_id`, `servico_id`, `tipo`);

CREATE TABLE `pagamentos` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `tipo` VARCHAR(12) NOT NULL DEFAULT 'principal',
  `valor` DECIMAL(10,2) NOT NULL,
  `status` ENUM('aguardando', 'retido', 'liberado', 'estornado') NOT NULL DEFAULT 'aguardando',
  `identificador` VARCHAR(60) NOT NULL UNIQUE,
  `gateway` ENUM('asaas', 'simulado') NOT NULL,
  `cobranca_id` VARCHAR(60) UNIQUE,
  `pix_copia_cola` TEXT,
  `pix_qr_code` MEDIUMTEXT,
  `expira_em` DATETIME NOT NULL,
  `expirado_em` DATETIME,
  `retido_em` DATETIME,
  `taxa_percentual` DECIMAL(5,2),
  `taxa_valor` DECIMAL(10,2),
  `valor_repasse` DECIMAL(10,2),
  `repasse_id` VARCHAR(60),
  `liberado_em` DATETIME,
  `repasse_pendente` VARCHAR(40),
  `valor_estorno` DECIMAL(10,2),
  `estorno_id` VARCHAR(60),
  `estornado_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `pagamentos` ADD INDEX `idx_pagamentos_servico` (`servico_id`);

CREATE TABLE `pausas` (
  `id` INTEGER auto_increment,
  `prestador_id` INTEGER NOT NULL,
  `inicio` DATETIME NOT NULL,
  `fim` DATETIME,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`prestador_id`) REFERENCES `prestadores` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `prestador_bairros` (
  `prestador_id` INTEGER,
  `bairro_id` INTEGER,
  PRIMARY KEY (`prestador_id`,
  `bairro_id`),
  FOREIGN KEY (`prestador_id`) REFERENCES `prestadores` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`bairro_id`) REFERENCES `bairros` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `prestador_bairros` ADD INDEX `idx_prestador_bairros_bairro` (`bairro_id`, `prestador_id`);

CREATE TABLE `prestador_categorias` (
  `prestador_id` INTEGER,
  `categoria_id` INTEGER,
  PRIMARY KEY (`prestador_id`,
  `categoria_id`),
  FOREIGN KEY (`prestador_id`) REFERENCES `prestadores` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `prestador_categorias` ADD INDEX `idx_prestador_categorias_categoria` (`categoria_id`, `prestador_id`);

CREATE TABLE `propostas_complementares` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL UNIQUE,
  `valor` DECIMAL(10,2) NOT NULL,
  `justificativa` TEXT NOT NULL,
  `foto` VARCHAR(80) NOT NULL,
  `status` ENUM('pendente', 'aceita', 'paga', 'recusada', 'encerrada') NOT NULL DEFAULT 'pendente',
  `respondida_em` DATETIME,
  `paga_em` DATETIME,
  `enviada_em` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `reagendamentos` (
  `id` INTEGER auto_increment,
  `servico_id` INTEGER NOT NULL,
  `proposto_por_id` INTEGER NOT NULL,
  `papel` ENUM('contratante', 'prestador') NOT NULL,
  `data_hora_anterior` DATETIME NOT NULL,
  `data_hora_nova` DATETIME NOT NULL,
  `motivo` VARCHAR(300),
  `status` ENUM('pendente', 'aceito', 'recusado', 'cancelado') NOT NULL DEFAULT 'pendente',
  `respondido_por_id` INTEGER,
  `respondido_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`servico_id`) REFERENCES `servicos` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE,
  FOREIGN KEY (`proposto_por_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `reagendamentos` ADD INDEX `idx_reagendamentos_servico` (`servico_id`);

CREATE TABLE `solicitacoes_exclusao` (
  `id` INTEGER auto_increment,
  `usuario_id` INTEGER NOT NULL,
  `tipo` ENUM('desativacao', 'exclusao_dados') NOT NULL,
  `origem` ENUM('painel_usuario', 'rotina_automatica') NOT NULL DEFAULT 'painel_usuario',
  `resultado` ENUM('concluida', 'recusada_pendencia') NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `tokens_senha` (
  `id` INTEGER auto_increment,
  `usuario_id` INTEGER NOT NULL,
  `token_hash` VARCHAR(120) NOT NULL,
  `expira_em` DATETIME NOT NULL,
  `usado_em` DATETIME,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

