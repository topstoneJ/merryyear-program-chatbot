CREATE TABLE `admin_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`business_ids_json` text DEFAULT '[]' NOT NULL,
	`can_manage_settings` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_accounts_username_unique` ON `admin_accounts` (`username`);
