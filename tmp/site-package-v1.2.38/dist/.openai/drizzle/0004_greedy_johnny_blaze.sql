ALTER TABLE `events` ADD `creator_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `attendance_visibility` text DEFAULT 'count' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `manager_token_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `rsvps` ADD `share_name` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvps` ADD `viewer_token_hash` text DEFAULT '' NOT NULL;