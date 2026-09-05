export const createNovelTriggerQueryInsert = `CREATE TRIGGER IF NOT EXISTS update_novel_stats 
AFTER INSERT ON Chapter
BEGIN
    UPDATE Novel
    SET 
        totalChapters = totalChapters + 1,
        chaptersDownloaded = chaptersDownloaded + CASE WHEN NEW.isDownloaded = 1 THEN 1 ELSE 0 END,
        chaptersUnread = chaptersUnread + CASE WHEN NEW.unread = 1 THEN 1 ELSE 0 END,
        lastUpdatedAt = CASE 
            WHEN NEW.updatedTime IS NOT NULL 
                 AND (
                    lastUpdatedAt IS NULL
                    OR julianday(NEW.updatedTime) > julianday(lastUpdatedAt)
                 )
            THEN NEW.updatedTime
            ELSE lastUpdatedAt
        END
    WHERE id = NEW.novelId;
END;

`;
export const createNovelTriggerQueryUpdate = `CREATE TRIGGER IF NOT EXISTS update_novel_stats_on_update 
AFTER UPDATE OF isDownloaded, unread, readTime, updatedTime ON Chapter
BEGIN
    UPDATE Novel
    SET 
        chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1),
        lastReadAt = (SELECT MAX(readTime) FROM Chapter WHERE Chapter.novelId = Novel.id),
        lastUpdatedAt = (
            SELECT updatedTime
            FROM Chapter
            WHERE Chapter.novelId = Novel.id AND updatedTime IS NOT NULL
            ORDER BY julianday(updatedTime) DESC
            LIMIT 1
        )
    WHERE id = NEW.novelId;
END;
`;
export const createNovelTriggerQueryDelete = `CREATE TRIGGER IF NOT EXISTS update_novel_stats_on_delete 
AFTER DELETE ON Chapter
BEGIN
    UPDATE Novel
    SET 
        chaptersDownloaded = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id AND Chapter.unread = 1),
        totalChapters = (SELECT COUNT(*) FROM Chapter WHERE Chapter.novelId = Novel.id),
        lastReadAt = (SELECT MAX(readTime) FROM Chapter WHERE Chapter.novelId = Novel.id),
        lastUpdatedAt = (
            SELECT updatedTime
            FROM Chapter
            WHERE Chapter.novelId = Novel.id AND updatedTime IS NOT NULL
            ORDER BY julianday(updatedTime) DESC
            LIMIT 1
        )
    WHERE id = OLD.novelId;
END;
`;

export const createCategoryTriggerQuery = `
  CREATE TRIGGER IF NOT EXISTS add_category AFTER INSERT ON Category
  BEGIN
    UPDATE Category SET sort = (SELECT IFNULL(sort, new.id)) WHERE id = new.id;
  END;
`;

/** `createNovelTriggerQuery*`'s manga mirror (`Chapter`/`Novel` -> `MangaChapter`/`Manga`, `novelId` -> `mangaId`). */
export const createMangaTriggerQueryInsert = `CREATE TRIGGER IF NOT EXISTS update_manga_stats
AFTER INSERT ON MangaChapter
BEGIN
    UPDATE Manga
    SET
        totalChapters = totalChapters + 1,
        chaptersDownloaded = chaptersDownloaded + CASE WHEN NEW.isDownloaded = 1 THEN 1 ELSE 0 END,
        chaptersUnread = chaptersUnread + CASE WHEN NEW.unread = 1 THEN 1 ELSE 0 END,
        lastUpdatedAt = CASE
            WHEN NEW.updatedTime IS NOT NULL
                 AND (
                    lastUpdatedAt IS NULL
                    OR julianday(NEW.updatedTime) > julianday(lastUpdatedAt)
                 )
            THEN NEW.updatedTime
            ELSE lastUpdatedAt
        END
    WHERE id = NEW.mangaId;
END;

`;
export const createMangaTriggerQueryUpdate = `CREATE TRIGGER IF NOT EXISTS update_manga_stats_on_update
AFTER UPDATE OF isDownloaded, unread, readTime, updatedTime ON MangaChapter
BEGIN
    UPDATE Manga
    SET
        chaptersDownloaded = (SELECT COUNT(*) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id AND MangaChapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id AND MangaChapter.unread = 1),
        lastReadAt = (SELECT MAX(readTime) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id),
        lastUpdatedAt = (
            SELECT updatedTime
            FROM MangaChapter
            WHERE MangaChapter.mangaId = Manga.id AND updatedTime IS NOT NULL
            ORDER BY julianday(updatedTime) DESC
            LIMIT 1
        )
    WHERE id = NEW.mangaId;
END;
`;
export const createMangaTriggerQueryDelete = `CREATE TRIGGER IF NOT EXISTS update_manga_stats_on_delete
AFTER DELETE ON MangaChapter
BEGIN
    UPDATE Manga
    SET
        chaptersDownloaded = (SELECT COUNT(*) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id AND MangaChapter.isDownloaded = 1),
        chaptersUnread = (SELECT COUNT(*) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id AND MangaChapter.unread = 1),
        totalChapters = (SELECT COUNT(*) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id),
        lastReadAt = (SELECT MAX(readTime) FROM MangaChapter WHERE MangaChapter.mangaId = Manga.id),
        lastUpdatedAt = (
            SELECT updatedTime
            FROM MangaChapter
            WHERE MangaChapter.mangaId = Manga.id AND updatedTime IS NOT NULL
            ORDER BY julianday(updatedTime) DESC
            LIMIT 1
        )
    WHERE id = OLD.mangaId;
END;
`;
