ALTER TABLE `event_content_items`
  MODIFY COLUMN `content_type` ENUM('TEXT', 'PDF', 'WORD', 'EXCEL', 'VIDEO', 'FILE') NOT NULL;
