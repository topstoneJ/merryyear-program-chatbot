CREATE TABLE `random_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`question_key` text NOT NULL,
	`question` text NOT NULL,
	`options_json` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`selected_options_json` text DEFAULT '[]' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`knowledge_source_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `random_question_business_status_idx` ON `random_questions` (`business_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `random_question_business_key_unique` ON `random_questions` (`business_id`,`question_key`);