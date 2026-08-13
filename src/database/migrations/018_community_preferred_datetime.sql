ALTER TABLE `community_registrations`
  ADD COLUMN `preferred_date` VARCHAR(255) NULL AFTER `message`,
  ADD COLUMN `preferred_time` VARCHAR(255) NULL AFTER `preferred_date`;
