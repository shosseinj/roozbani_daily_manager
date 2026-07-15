CREATE TABLE IF NOT EXISTS `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL UNIQUE,
  `display_name` text NOT NULL,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `password_iterations` integer DEFAULT 100000 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_users_username` ON `users` (`username`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `token_hash` text NOT NULL UNIQUE,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sessions_token` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_user` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_expiry` ON `sessions` (`expires_at`);
