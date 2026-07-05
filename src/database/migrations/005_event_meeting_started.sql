ALTER TABLE `events`
  ADD COLUMN `meeting_started_at` DATETIME NULL AFTER `meeting_room_id`;