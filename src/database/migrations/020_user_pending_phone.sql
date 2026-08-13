ALTER TABLE `users`
  ADD COLUMN `pending_phone` VARCHAR(255) NULL AFTER `otp_expires_at`;
