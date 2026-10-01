CREATE TABLE `line_manager_batch_bind_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`event_ids` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `line_manager_bind_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `line_manager_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`line_user_id` text NOT NULL,
	`paired_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_manager_targets_event_user_unique` ON `line_manager_targets` (`event_id`,`line_user_id`);--> statement-breakpoint
CREATE INDEX `line_manager_targets_event_updated` ON `line_manager_targets` (`event_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `events` ADD `address` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `share_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `events_share_code_unique` ON `events` (`share_code`);