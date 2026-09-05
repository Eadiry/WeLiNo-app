CREATE TABLE IF NOT EXISTS `Manga` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`pluginId` text NOT NULL,
	`name` text NOT NULL,
	`cover` text,
	`summary` text,
	`author` text,
	`artist` text,
	`status` text DEFAULT 'Unknown',
	`genres` text,
	`inLibrary` integer DEFAULT false,
	`isLocal` integer DEFAULT false,
	`totalPages` integer DEFAULT 0,
	`chaptersDownloaded` integer DEFAULT 0,
	`chaptersUnread` integer DEFAULT 0,
	`totalChapters` integer DEFAULT 0,
	`lastReadAt` text,
	`lastUpdatedAt` text,
	`readerMode` text DEFAULT 'vertical' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `manga_path_plugin_unique` ON `Manga` (`path`,`pluginId`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `MangaIndex` ON `Manga` (`pluginId`,`path`,`id`,`inLibrary`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `MangaChapter` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mangaId` integer NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`releaseTime` text,
	`bookmark` integer DEFAULT false,
	`unread` integer DEFAULT true,
	`readTime` text,
	`isDownloaded` integer DEFAULT false,
	`updatedTime` text,
	`chapterNumber` real,
	`page` text DEFAULT '1',
	`position` integer DEFAULT 0,
	`progress` integer,
	`lastPageRead` integer DEFAULT 0,
	`scanlator` text,
	`timeSpent` integer DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `manga_chapter_manga_path_unique` ON `MangaChapter` (`mangaId`,`path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mangaChapterMangaIdIndex` ON `MangaChapter` (`mangaId`,`position`,`page`,`id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `MangaCategory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mangaId` integer NOT NULL,
	`categoryId` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `manga_category_unique` ON `MangaCategory` (`mangaId`,`categoryId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `MangaRepository` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `manga_repository_url_unique` ON `MangaRepository` (`url`);
