CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`event_date` text NOT NULL,
	`start_time` text NOT NULL,
	`location` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_phone` text DEFAULT '' NOT NULL,
	`capacity` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`edit_code_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`party_size` integer DEFAULT 1 NOT NULL,
	`diet` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`response` text DEFAULT 'attending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvps_event_name_unique` ON `rsvps` (`event_id`,`name`);