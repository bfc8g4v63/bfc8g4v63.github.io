CREATE TABLE `uri_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`start_date` text,
	`end_date` text,
	`state` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `uri_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `uri_entries_visible_created` ON `uri_entries` (`deleted_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `uri_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uri_invite_hash_unique` ON `uri_invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `uri_members` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uri_active_subject` ON `uri_members` (`subject`) WHERE "uri_members"."active" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `uri_active_role` ON `uri_members` (`role`) WHERE "uri_members"."active" = 1;--> statement-breakpoint
CREATE TABLE `uri_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `uri_entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `uri_photos_entry` ON `uri_photos` (`entry_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `api_rate_limits` (`key` text PRIMARY KEY NOT NULL, `count` integer NOT NULL, `reset_at` integer NOT NULL);
