ALTER TABLE events
  MODIFY COLUMN description TEXT NULL,
  ADD COLUMN gallery_images JSON NULL AFTER image_url;
