ALTER TABLE `admin_accounts` ADD `can_view_consultations` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `can_delete_consultations` integer DEFAULT false NOT NULL;
