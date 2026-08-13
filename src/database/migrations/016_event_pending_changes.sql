ALTER TABLE `events`
  ADD COLUMN `pending_changes` JSON NULL AFTER `rejection_reason`;
