CREATE TABLE `hunem_objects` (
	`path` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hunem_runtime` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`lease` text,
	`lease_until` integer
);
