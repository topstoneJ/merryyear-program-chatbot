CREATE TABLE `consultation_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`replacement_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consultation_categories_name_unique` ON `consultation_categories` (`name`);--> statement-breakpoint
ALTER TABLE `consultations` ADD `category_manual` integer DEFAULT 0 NOT NULL;