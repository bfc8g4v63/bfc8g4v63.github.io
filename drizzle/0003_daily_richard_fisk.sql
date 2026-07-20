CREATE TABLE `site_stats` (
	`key` text PRIMARY KEY NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
