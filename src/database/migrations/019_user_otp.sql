ALTER TABLE `users`
  ADD COLUMN `otp_code` VARCHAR(10) NULL AFTER `phone`,
  ADD COLUMN `otp_expires_at` DATETIME NULL AFTER `otp_code`;
