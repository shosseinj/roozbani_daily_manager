CREATE TABLE IF NOT EXISTS `phd_profiles` (
  `owner_id` text PRIMARY KEY NOT NULL,
  `headline` text DEFAULT 'Medical AI researcher' NOT NULL,
  `research_interests_json` text DEFAULT '[]' NOT NULL,
  `skills_json` text DEFAULT '[]' NOT NULL,
  `education_summary` text,
  `target_countries_json` text DEFAULT '[]' NOT NULL,
  `english_goal` text,
  `relocation_goal` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `phd_positions` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `source` text NOT NULL,
  `source_key` text,
  `title` text NOT NULL,
  `university` text NOT NULL,
  `professor` text,
  `country` text NOT NULL,
  `city` text,
  `research_area` text NOT NULL,
  `description` text,
  `url` text,
  `funding_status` text DEFAULT 'unknown' NOT NULL,
  `scholarship` integer DEFAULT 0 NOT NULL,
  `funding_amount` text,
  `deadline` text,
  `status` text DEFAULT 'discovered' NOT NULL,
  `is_demo` integer DEFAULT 0 NOT NULL,
  `discovered_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_phd_positions_owner_deadline` ON `phd_positions` (`owner_id`,`deadline`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_phd_positions_owner_source_key` ON `phd_positions` (`owner_id`,`source`,`source_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `position_matches` (
  `position_id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `research_score` integer NOT NULL,
  `publication_score` integer NOT NULL,
  `skill_score` integer NOT NULL,
  `education_score` integer NOT NULL,
  `overall_score` integer NOT NULL,
  `explanation` text NOT NULL,
  `strengths_json` text DEFAULT '[]' NOT NULL,
  `gaps_json` text DEFAULT '[]' NOT NULL,
  `scored_by` text DEFAULT 'deterministic-v1' NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`position_id`) REFERENCES `phd_positions` (`id`) ON DELETE cascade,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_position_matches_owner_score` ON `position_matches` (`owner_id`,`overall_score`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `phd_applications` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `position_id` text NOT NULL,
  `status` text DEFAULT 'shortlisted' NOT NULL,
  `priority` integer DEFAULT 2 NOT NULL,
  `next_action` text,
  `next_action_date` text,
  `notes` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade,
  FOREIGN KEY (`position_id`) REFERENCES `phd_positions` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_phd_applications_owner_position` ON `phd_applications` (`owner_id`,`position_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_phd_applications_owner_status` ON `phd_applications` (`owner_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `phd_timeline_events` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `application_id` text,
  `position_id` text,
  `event_type` text NOT NULL,
  `title` text NOT NULL,
  `metadata_json` text DEFAULT '{}' NOT NULL,
  `occurred_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_phd_timeline_owner_time` ON `phd_timeline_events` (`owner_id`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `planner_links` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `task_id` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `action_type` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_planner_links_dedupe` ON `planner_links` (`owner_id`,`entity_type`,`entity_id`,`action_type`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_planner_links_task` ON `planner_links` (`task_id`);
