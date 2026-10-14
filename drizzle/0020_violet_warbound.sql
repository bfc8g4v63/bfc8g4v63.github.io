CREATE TABLE `memory_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`actor_member_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `memory_audit_logs_family_created` ON `memory_audit_logs` (`family_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memory_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`reporter_member_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by_member_id` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`family_id`) REFERENCES `memory_families`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reporter_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_member_id`) REFERENCES `memory_family_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `memory_reports_family_status_created` ON `memory_reports` (`family_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `memory_comments` ADD `hidden_at` text;--> statement-breakpoint
ALTER TABLE `memory_media` ADD `hidden_at` text;