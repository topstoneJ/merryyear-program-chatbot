CREATE TABLE `data_repairs` (
	`id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_source_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `knowledge_revision_source_idx` ON `knowledge_source_revisions` (`source_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_email` text DEFAULT '' NOT NULL;