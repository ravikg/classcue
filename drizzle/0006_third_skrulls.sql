CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`reminder_job_id` text NOT NULL,
	`push_subscription_id` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`error_code` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`reminder_job_id`) REFERENCES `reminder_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`push_subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_deliveries_job_subscription_uidx` ON `push_deliveries` (`reminder_job_id`,`push_subscription_id`);--> statement-breakpoint
CREATE INDEX `push_deliveries_status_idx` ON `push_deliveries` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`device_label` text,
	`user_agent` text,
	`status` text DEFAULT 'active' NOT NULL,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`last_success_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_uidx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_household_status_idx` ON `push_subscriptions` (`household_id`,`status`);--> statement-breakpoint
ALTER TABLE `reminder_jobs` ADD `next_attempt_at` text;