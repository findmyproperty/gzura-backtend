ALTER TABLE `events`
  ADD COLUMN `latitude` DECIMAL(10, 7) NULL AFTER `location`,
  ADD COLUMN `longitude` DECIMAL(10, 7) NULL AFTER `latitude`;