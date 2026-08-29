ALTER TABLE users
  ADD COLUMN can_host TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

UPDATE users
SET can_host = 1
WHERE role IN ('HOST', 'ADMIN');
