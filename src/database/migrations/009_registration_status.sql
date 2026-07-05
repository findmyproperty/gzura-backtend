ALTER TABLE `community_registrations`
  ADD COLUMN `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending' AFTER `message`;