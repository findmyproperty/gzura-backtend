ALTER TABLE `events`
  ADD COLUMN `host_id` VARCHAR(36) NULL AFTER `speaker_bio`,
  ADD CONSTRAINT `events_host_id_fkey`
    FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;