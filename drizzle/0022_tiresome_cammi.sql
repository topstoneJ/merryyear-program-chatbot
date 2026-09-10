ALTER TABLE `businesses` ADD `notice_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_department` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `contact_hours` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `businesses` SET `notice_url` = COALESCE((
  SELECT k.`source_url` FROM `business_homepage_sources` h
  JOIN `knowledge_sources` k ON k.`id` = h.`source_id` AND k.`business_id` = h.`business_id`
  WHERE h.`business_id` = `businesses`.`id` AND k.`type` = 'website' AND k.`source_url` IS NOT NULL
  LIMIT 1
), '') WHERE `notice_url` = '';
