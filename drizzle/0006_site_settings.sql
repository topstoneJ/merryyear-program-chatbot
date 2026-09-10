CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_name` text NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`logo_key` text,
	`main_headline` text NOT NULL,
	`main_subcopy` text NOT NULL,
	`chatbot_greeting` text NOT NULL,
	`primary_color` text DEFAULT '#f26a2e' NOT NULL,
	`updated_at` integer NOT NULL
);
