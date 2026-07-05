ALTER TABLE `events`
  ADD COLUMN `meeting_room_id` VARCHAR(120) NULL AFTER `location`,
  ADD UNIQUE INDEX `events_meeting_room_id_key` (`meeting_room_id`);

UPDATE `events`
SET `meeting_room_id` = CONCAT(
  'gzura-',
  LOWER(REGEXP_REPLACE(`slug`, '[^a-zA-Z0-9]', '')),
  '-',
  SUBSTRING(REPLACE(`id`, '-', ''), 1, 10)
)
WHERE `type` = 'Online' AND (`meeting_room_id` IS NULL OR `meeting_room_id` = '');