CREATE TABLE `fee_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_charge_id` text NOT NULL,
	`session_id` text,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`session_quantity` integer,
	`reason` text NOT NULL,
	`source` text DEFAULT 'parent' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fee_charge_id`) REFERENCES `fee_charges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fee_adjustments_charge_idx` ON `fee_adjustments` (`fee_charge_id`);--> statement-breakpoint
CREATE TABLE `fee_arrangements` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`model` text NOT NULL,
	`currency` text NOT NULL,
	`base_amount_minor` integer NOT NULL,
	`sessions_included` integer,
	`billing_cadence` text,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`compensation_policy` text DEFAULT 'manual' NOT NULL,
	`configuration_json` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fee_arrangements_enrollment_idx` ON `fee_arrangements` (`enrollment_id`);--> statement-breakpoint
CREATE INDEX `fee_arrangements_status_idx` ON `fee_arrangements` (`status`);--> statement-breakpoint
CREATE TABLE `fee_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_arrangement_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`due_date` text NOT NULL,
	`suggested_amount_minor` integer NOT NULL,
	`confirmed_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'due' NOT NULL,
	`calculation_snapshot` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fee_arrangement_id`) REFERENCES `fee_arrangements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fee_charges_arrangement_period_uidx` ON `fee_charges` (`fee_arrangement_id`,`period_start`,`period_end`);--> statement-breakpoint
CREATE INDEX `fee_charges_due_status_idx` ON `fee_charges` (`due_date`,`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`fee_charge_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`paid_at` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`note` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fee_charge_id`) REFERENCES `fee_charges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_charge_idx` ON `payments` (`fee_charge_id`);--> statement-breakpoint
CREATE TABLE `session_credit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`fee_charge_id` text,
	`session_id` text,
	`entry_type` text NOT NULL,
	`quantity` integer NOT NULL,
	`reason` text NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fee_charge_id`) REFERENCES `fee_charges`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_credit_entries_enrollment_idx` ON `session_credit_entries` (`enrollment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_credit_entries_charge_type_uidx` ON `session_credit_entries` (`fee_charge_id`,`entry_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_credit_entries_session_type_uidx` ON `session_credit_entries` (`session_id`,`entry_type`);