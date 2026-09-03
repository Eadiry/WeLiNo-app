CREATE TABLE IF NOT EXISTS `NameSubstitution` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`novelId` integer NOT NULL,
	`pattern` text NOT NULL,
	`replacement` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'plain' NOT NULL,
	`wholeWord` integer DEFAULT true NOT NULL,
	`caseSensitive` integer DEFAULT false NOT NULL,
	`preserveCase` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `name_substitution_novel` ON `NameSubstitution` (`novelId`);
