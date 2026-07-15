CREATE TABLE IF NOT EXISTS `agent_action_proposals` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `summary` text NOT NULL,
  `operations_json` text NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `applied_at` text,
  `undone_at` text,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_proposals_owner_created` ON `agent_action_proposals` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_action_events` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `proposal_id` text NOT NULL,
  `operation_type` text NOT NULL,
  `task_id` text NOT NULL,
  `before_json` text,
  `after_json` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE cascade,
  FOREIGN KEY (`proposal_id`) REFERENCES `agent_action_proposals` (`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_events_proposal` ON `agent_action_events` (`owner_id`,`proposal_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `identity_hash` text NOT NULL,
  `ip_hash` text NOT NULL,
  `action` text NOT NULL,
  `success` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_attempts_identity_time` ON `auth_attempts` (`identity_hash`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_attempts_ip_time` ON `auth_attempts` (`ip_hash`,`created_at`);
