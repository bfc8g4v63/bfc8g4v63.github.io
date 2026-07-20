ALTER TABLE `events` ADD `access_mode` text DEFAULT 'unlisted' NOT NULL;--> statement-breakpoint
UPDATE `events` SET `access_mode` = 'public';--> statement-breakpoint
ALTER TABLE `events` ADD `share_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `participant_code_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `events` SET `share_token` = lower(hex(randomblob(16))) WHERE `share_token` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `events_share_token_unique` ON `events` (`share_token`);
