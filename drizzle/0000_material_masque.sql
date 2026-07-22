CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`source_url` text,
	`file_key` text,
	`file_name` text,
	`content` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
