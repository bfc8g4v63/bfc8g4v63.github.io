CREATE TABLE `memory_capsules` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`title` text NOT NULL,
	`introduction` text DEFAULT '' NOT NULL,
	`era_label` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_by_member_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `memory_capsules_family_visible_sort` ON `memory_capsules` (`family_id`,`is_archived`,`sort_order`);--> statement-breakpoint
CREATE TABLE `memory_media` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`capsule_id` text NOT NULL,
	`author_member_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`upload_state` text DEFAULT 'pending' NOT NULL,
	`upload_expires_at` text NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`capsule_id`) REFERENCES `memory_capsules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_media_object_key_unique` ON `memory_media` (`object_key`);--> statement-breakpoint
CREATE INDEX `memory_media_capsule_visible_created` ON `memory_media` (`capsule_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `memory_media_family_visible_created` ON `memory_media` (`family_id`,`deleted_at`,`created_at`);