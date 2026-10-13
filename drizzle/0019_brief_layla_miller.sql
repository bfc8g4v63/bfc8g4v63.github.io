CREATE TABLE `memory_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`capsule_id` text,
	`media_id` text,
	`author_member_id` text NOT NULL,
	`body` text NOT NULL,
	`display_as` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'comment' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`capsule_id`) REFERENCES `memory_capsules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `memory_media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `memory_comments_family_visible_created` ON `memory_comments` (`family_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `memory_comments_media_visible_created` ON `memory_comments` (`media_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `memory_comments_capsule_visible_created` ON `memory_comments` (`capsule_id`,`deleted_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `memory_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`member_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reaction` text DEFAULT 'heart' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_reactions_member_target_unique` ON `memory_reactions` (`member_id`,`target_type`,`target_id`,`reaction`);--> statement-breakpoint
CREATE INDEX `memory_reactions_family_target` ON `memory_reactions` (`family_id`,`target_type`,`target_id`);--> statement-breakpoint
ALTER TABLE `memory_capsules` ADD `cover_media_id` text;--> statement-breakpoint
ALTER TABLE `memory_media` ADD `captured_at` text;