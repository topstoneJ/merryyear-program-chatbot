ALTER TABLE `businesses` ADD `sort_order` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `businesses`
SET `sort_order` = CASE
  WHEN `id` = 'enterprise' THEN 10
  WHEN `id` = 'crisis' THEN 20
  WHEN `code` GLOB 'B[0-9]*' THEN CAST(SUBSTR(`code`, 2) AS INTEGER) * 10
  ELSE 100000
END;
