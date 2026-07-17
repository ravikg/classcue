CREATE TABLE `session_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_session_id` text NOT NULL,
	`target_session_id` text NOT NULL,
	`link_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_links_pair_type_uidx` ON `session_links` (`source_session_id`,`target_session_id`,`link_type`);--> statement-breakpoint
CREATE INDEX `session_links_source_idx` ON `session_links` (`source_session_id`);--> statement-breakpoint
CREATE INDEX `session_links_target_idx` ON `session_links` (`target_session_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `compensation_status` text;