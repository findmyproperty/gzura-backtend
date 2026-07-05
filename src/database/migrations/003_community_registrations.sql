CREATE TABLE IF NOT EXISTS `community_registrations` (
    `id` VARCHAR(36) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(255) NULL,
    `gender` VARCHAR(50) NULL,
    `profession` VARCHAR(255) NULL,
    `interest` VARCHAR(100) NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;