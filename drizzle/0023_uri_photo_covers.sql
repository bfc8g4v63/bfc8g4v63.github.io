CREATE TABLE IF NOT EXISTS `uri_photo_covers` (
  `entry_id` text PRIMARY KEY NOT NULL REFERENCES `uri_entries`(`id`) ON DELETE CASCADE,
  `photo_id` text NOT NULL REFERENCES `uri_photos`(`id`) ON DELETE CASCADE
);
