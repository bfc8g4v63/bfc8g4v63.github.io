CREATE TABLE `fairy_notification_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`line_user_id` text NOT NULL,
	`paired_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
