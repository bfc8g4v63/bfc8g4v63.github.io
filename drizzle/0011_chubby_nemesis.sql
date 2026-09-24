CREATE TABLE `site_visit_windows` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_visit_windows_expires_at` ON `site_visit_windows` (`expires_at`);
--> statement-breakpoint
CREATE TRIGGER `site_visit_windows_increment_homepage_views`
AFTER INSERT ON `site_visit_windows`
BEGIN
  UPDATE `site_stats`
  SET `views` = `views` + 1,
      `updated_at` = CURRENT_TIMESTAMP
  WHERE `key` = 'homepage';
END;
