CREATE TABLE `line_groups` (
	`group_id` text PRIMARY KEY NOT NULL,
	`group_name` text DEFAULT 'LINE 群組' NOT NULL,
	`owner_credential_hash` text DEFAULT '' NOT NULL,
	`bound_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP INDEX `line_bindings_group_unique`;--> statement-breakpoint
CREATE INDEX `line_bindings_group_event` ON `line_bindings` (`group_id`,`event_id`);--> statement-breakpoint
ALTER TABLE `line_bind_codes` ADD `owner_credential_hash` text DEFAULT '' NOT NULL;