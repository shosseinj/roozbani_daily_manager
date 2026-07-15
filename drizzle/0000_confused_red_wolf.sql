CREATE TABLE `agent_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`openrouter_key_cipher` text,
	`openrouter_key_hint` text,
	`openrouter_model` text DEFAULT 'openrouter/auto' NOT NULL,
	`telegram_token_cipher` text,
	`telegram_bot_name` text,
	`telegram_chat_id` text,
	`telegram_webhook_secret` text,
	`telegram_webhook_status` text DEFAULT 'disconnected' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'دوست من' NOT NULL,
	`timezone` text DEFAULT 'Asia/Tehran' NOT NULL,
	`day_start` text DEFAULT '08:00' NOT NULL,
	`day_end` text DEFAULT '22:00' NOT NULL,
	`planning_style` text DEFAULT 'balanced' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`scheduled_date` text NOT NULL,
	`start_time` text DEFAULT '09:00' NOT NULL,
	`duration_minutes` integer DEFAULT 30 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`energy` text DEFAULT 'medium' NOT NULL,
	`area` text DEFAULT 'سایر' NOT NULL,
	`recurring_rule` text DEFAULT 'none' NOT NULL,
	`created_by_ai` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
