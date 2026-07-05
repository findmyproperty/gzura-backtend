CREATE TABLE IF NOT EXISTS event_content_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  event_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content_type ENUM('TEXT', 'PDF', 'WORD', 'EXCEL') NOT NULL,
  text_content TEXT NULL,
  file_url VARCHAR(500) NULL,
  file_name VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_content_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  INDEX idx_event_content_event_id (event_id)
);
