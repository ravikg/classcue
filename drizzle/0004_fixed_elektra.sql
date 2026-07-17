CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_household_idx` ON `audit_events` (`household_id`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `reminder_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`related_record_type` text NOT NULL,
	`related_record_id` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`delivery_channel` text DEFAULT 'browser' NOT NULL,
	`provider_message_id` text,
	`last_error` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `reminder_rules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminder_jobs_idempotency_uidx` ON `reminder_jobs` (`rule_id`,`related_record_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `reminder_jobs_status_schedule_idx` ON `reminder_jobs` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`enrollment_id` text,
	`fee_arrangement_id` text,
	`type` text NOT NULL,
	`lead_minutes` integer DEFAULT 0 NOT NULL,
	`repeat_interval_minutes` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`timezone` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fee_arrangement_id`) REFERENCES `fee_arrangements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminder_rules_household_idx` ON `reminder_rules` (`household_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_enrollment_idx` ON `reminder_rules` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `reminder_rules_fee_arrangement_idx` ON `reminder_rules` (`fee_arrangement_id`);--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`type` text NOT NULL,
	`evidence_json` text NOT NULL,
	`proposed_action_json` text NOT NULL,
	`explanation` text NOT NULL,
	`source` text DEFAULT 'rules_v1' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `suggestions_household_status_idx` ON `suggestions` (`household_id`,`status`);