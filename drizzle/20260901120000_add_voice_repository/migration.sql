CREATE TABLE IF NOT EXISTS `VoiceRepository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `voice_repository_url_unique` ON `VoiceRepository` (`url`);
