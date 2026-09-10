CREATE TABLE `api_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`model` text NOT NULL,
	`purpose` text NOT NULL,
	`status` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`thought_tokens` integer,
	`cached_tokens` integer,
	`estimated_usd` real
);

--> statement-breakpoint
CREATE INDEX `api_usage_created_at_idx` ON `api_usage` (`created_at`);
