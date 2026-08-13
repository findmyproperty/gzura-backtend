-- Rejection reason on events (skip if the column already exists)
ALTER TABLE `events`
  ADD COLUMN `rejection_reason` TEXT NULL AFTER `status`;

ALTER TABLE `events`
  MODIFY COLUMN `status` ENUM('DRAFT', 'PUBLISHED', 'PENDING', 'REJECTED') NOT NULL DEFAULT 'DRAFT';

CREATE TABLE IF NOT EXISTS `event_activity_logs` (
  `id` VARCHAR(36) NOT NULL,
  `event_id` VARCHAR(36) NOT NULL,
  `action` VARCHAR(32) NOT NULL,
  `message` TEXT NULL,
  `actor_id` VARCHAR(36) NULL,
  `actor_name` VARCHAR(255) NULL,
  `actor_role` VARCHAR(32) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  INDEX `event_activity_logs_event_id_idx` (`event_id`),
  CONSTRAINT `event_activity_logs_event_id_fkey`
    FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
