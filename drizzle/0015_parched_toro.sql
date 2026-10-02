CREATE TABLE `activity_line_groups` (
	`event_id` text NOT NULL,
	`group_id` text NOT NULL,
	`group_name` text DEFAULT 'LINE 群組' NOT NULL,
	`bound_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_line_groups_event_group_unique` ON `activity_line_groups` (`event_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `activity_line_groups_group_event` ON `activity_line_groups` (`group_id`,`event_id`);--> statement-breakpoint
ALTER TABLE `line_groups` ADD `is_test` integer DEFAULT false NOT NULL;