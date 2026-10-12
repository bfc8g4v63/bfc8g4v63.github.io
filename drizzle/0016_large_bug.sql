CREATE TABLE `memory_families` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_families_slug_unique` ON `memory_families` (`slug`);--> statement-breakpoint
CREATE TABLE `memory_family_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_by_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_family_invites_code_hash_unique` ON `memory_family_invites` (`code_hash`);--> statement-breakpoint
CREATE INDEX `memory_family_invites_family_active` ON `memory_family_invites` (`family_id`,`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `memory_family_members` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`line_subject` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_family_members_family_subject_unique` ON `memory_family_members` (`family_id`,`line_subject`);--> statement-breakpoint
CREATE INDEX `memory_family_members_subject_active` ON `memory_family_members` (`line_subject`,`is_active`);