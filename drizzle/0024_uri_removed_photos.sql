CREATE TABLE IF NOT EXISTS `uri_removed_photos` (
  `photo_id` text PRIMARY KEY NOT NULL REFERENCES `uri_photos`(`id`) ON DELETE CASCADE,
  `removed_at` text NOT NULL
);
