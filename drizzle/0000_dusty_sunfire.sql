CREATE TABLE `attendance_records` (
	`session_id` text PRIMARY KEY NOT NULL,
	`attendance_status` text NOT NULL,
	`punctuality` text,
	`minutes_late` integer,
	`note` text,
	`recorded_by_user_id` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `children` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `children_household_idx` ON `children` (`household_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`provider_id` text,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_household_idx` ON `contacts` (`household_id`);--> statement-breakpoint
CREATE TABLE `enrollment_contacts` (
	`enrollment_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`enrollment_id`, `contact_id`, `role`),
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `enrollment_contacts_contact_idx` ON `enrollment_contacts` (`contact_id`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`child_id` text NOT NULL,
	`provider_id` text,
	`subject` text NOT NULL,
	`display_name` text NOT NULL,
	`location` text,
	`online_url` text,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` text NOT NULL,
	`archived_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `enrollments_household_idx` ON `enrollments` (`household_id`);--> statement-breakpoint
CREATE INDEX `enrollments_child_idx` ON `enrollments` (`child_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'owner' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `household_members_user_idx` ON `household_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'My family' NOT NULL,
	`default_timezone` text DEFAULT 'Asia/Dubai' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `providers_household_idx` ON `providers` (`household_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `providers_household_name_uidx` ON `providers` (`household_id`,`name`);--> statement-breakpoint
CREATE TABLE `schedule_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`local_start_time` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`timezone` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`superseded_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `schedule_rules_enrollment_idx` ON `schedule_rules` (`enrollment_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`schedule_rule_id` text,
	`local_date` text NOT NULL,
	`planned_start_at` text NOT NULL,
	`planned_end_at` text NOT NULL,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`source` text DEFAULT 'recurrence' NOT NULL,
	`reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_rule_id`) REFERENCES `schedule_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_rule_date_uidx` ON `sessions` (`schedule_rule_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `sessions_enrollment_start_idx` ON `sessions` (`enrollment_id`,`planned_start_at`);--> statement-breakpoint
CREATE INDEX `sessions_start_status_idx` ON `sessions` (`planned_start_at`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`auth_provider` text DEFAULT 'siwc' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_provider_email_uidx` ON `users` (`auth_provider`,`email`);