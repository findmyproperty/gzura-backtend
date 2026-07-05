ALTER TABLE `events`
  ADD COLUMN `google_calendar_event_id` VARCHAR(255) NULL AFTER `meeting_room_id`;