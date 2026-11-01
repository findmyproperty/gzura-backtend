CREATE TABLE IF NOT EXISTS `role_requests` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `user_id` CHAR(36) NOT NULL,
  `from_role` ENUM('MEMBER', 'HOST', 'ADMIN') NOT NULL,
  `to_role` ENUM('MEMBER', 'HOST', 'ADMIN') NOT NULL,
  `message` TEXT NULL,
  `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `admin_note` TEXT NULL,
  `reviewed_by` CHAR(36) NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_role_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_requests_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  INDEX `idx_role_requests_user_id` (`user_id`),
  INDEX `idx_role_requests_status` (`status`)
);
