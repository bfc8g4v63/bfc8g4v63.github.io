ALTER TABLE `events` ADD `fee_per_person` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvps` ADD `payment_status` text DEFAULT 'not_applicable' NOT NULL;