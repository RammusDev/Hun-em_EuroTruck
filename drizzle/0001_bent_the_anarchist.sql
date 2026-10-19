CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`subject` text NOT NULL,
	`action` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_flows` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`sub` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'unrequested' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt` integer,
	`next_attempt` integer NOT NULL,
	`lease_until` integer,
	`lease` text,
	`provider_id` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `owner_identity` (
	`id` integer PRIMARY KEY NOT NULL,
	`sub` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_requests` (
	`sub` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`capacity` integer NOT NULL
);
