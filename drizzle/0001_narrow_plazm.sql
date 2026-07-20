CREATE TABLE `line_bind_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `line_bindings` (
	`event_id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`group_name` text DEFAULT 'LINE 群組' NOT NULL,
	`bound_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_bindings_group_unique` ON `line_bindings` (`group_id`);--> statement-breakpoint
CREATE TABLE `line_reminder_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`reminder_key` text NOT NULL,
	`event_fingerprint` text NOT NULL,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `line_reminder_delivery_unique` ON `line_reminder_deliveries` (`event_id`,`reminder_key`,`event_fingerprint`);--> statement-breakpoint
CREATE TABLE `line_reminder_settings` (
	`event_id` text PRIMARY KEY NOT NULL,
	`seven_days` integer DEFAULT true NOT NULL,
	`one_day` integer DEFAULT true NOT NULL,
	`two_hours` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
