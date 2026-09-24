CREATE TABLE `companion_cards` (
	`rsvp_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`display_name` text NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`intents` text DEFAULT '[]' NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rsvp_id`) REFERENCES `rsvps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companion_cards_event_visible_updated` ON `companion_cards` (`event_id`,`is_visible`,`updated_at`);--> statement-breakpoint
CREATE TABLE `companion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`from_rsvp_id` text NOT NULL,
	`to_rsvp_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_rsvp_id`) REFERENCES `rsvps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_rsvp_id`) REFERENCES `rsvps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companion_requests_event_from_to_kind_unique` ON `companion_requests` (`event_id`,`from_rsvp_id`,`to_rsvp_id`,`kind`);--> statement-breakpoint
CREATE INDEX `companion_requests_event_to_status` ON `companion_requests` (`event_id`,`to_rsvp_id`,`status`);--> statement-breakpoint
CREATE INDEX `companion_requests_event_from_status` ON `companion_requests` (`event_id`,`from_rsvp_id`,`status`);