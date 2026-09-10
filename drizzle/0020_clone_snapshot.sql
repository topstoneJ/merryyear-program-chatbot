-- Schema-only migration. Runtime data and administrator credentials are intentionally excluded.
ALTER TABLE `admin_accounts` ADD `is_super_admin` integer DEFAULT false NOT NULL;
