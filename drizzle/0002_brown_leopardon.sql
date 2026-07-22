CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`summary` text NOT NULL,
	`decision` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`review` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consultation_business_date_idx` ON `consultations` (`business_id`,`created_at`);