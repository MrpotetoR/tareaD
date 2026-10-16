-- MySQL 8+
-- Solo se almacenan emails y hashes; nunca contraseñas originales.

CREATE DATABASE IF NOT EXISTS uttecam
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE uttecam;

CREATE TABLE IF NOT EXISTS credenciales_recibidas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_credenciales_recibidas_email (email)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
