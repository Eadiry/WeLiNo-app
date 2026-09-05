/**
 * Tests for the manga chapter-stats triggers (`createMangaTriggerQuery*` in
 * `queryStrings/triggers.ts`) -- the manga mirror of the novel triggers
 * already covered by `db.test.ts`. Verifies `Manga.chaptersDownloaded`/
 * `chaptersUnread`/`totalChapters`/`lastReadAt`/`lastUpdatedAt` stay correct
 * across insert, update, and delete of `MangaChapter` rows, exercised via
 * raw SQL (the triggers are pure SQL logic, independent of any query
 * wrapper) against the same in-memory DB the query tests use.
 */
import '../queries/__tests__/mockDb';
import {
  setupTestDatabase,
  getTestDb,
  teardownTestDatabase,
} from '../queries/__tests__/setup';

describe('manga chapter-stats triggers', () => {
  beforeEach(() => {
    setupTestDatabase();
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  const mangaStats = () =>
    getTestDb().sqlite.executeSync(
      'SELECT chaptersDownloaded, chaptersUnread, totalChapters, lastReadAt, lastUpdatedAt FROM Manga WHERE id = 1',
    ).rows[0];

  it('increments counters on insert', () => {
    const { sqlite } = getTestDb();
    sqlite.executeSync(`
      INSERT INTO Manga (id, path, pluginId, name)
      VALUES (1, '/manga', 'test-plugin', 'Test Manga')
    `);

    sqlite.executeSync(`
      INSERT INTO MangaChapter (id, mangaId, path, name, unread, isDownloaded, updatedTime)
      VALUES (1, 1, '/manga/c1', 'Chapter 1', 1, 1, '2026-08-01T00:00:00.000Z')
    `);
    expect(mangaStats()).toEqual({
      chaptersDownloaded: 1,
      chaptersUnread: 1,
      totalChapters: 1,
      lastReadAt: null,
      lastUpdatedAt: '2026-08-01T00:00:00.000Z',
    });

    sqlite.executeSync(`
      INSERT INTO MangaChapter (id, mangaId, path, name, unread, isDownloaded, updatedTime)
      VALUES (2, 1, '/manga/c2', 'Chapter 2', 1, 0, '2026-08-02T00:00:00.000Z')
    `);
    expect(mangaStats()).toEqual({
      chaptersDownloaded: 1,
      chaptersUnread: 2,
      totalChapters: 2,
      lastReadAt: null,
      lastUpdatedAt: '2026-08-02T00:00:00.000Z',
    });
  });

  it('recomputes counters and lastReadAt when a chapter is marked read', () => {
    const { sqlite } = getTestDb();
    sqlite.executeSync(`
      INSERT INTO Manga (id, path, pluginId, name)
      VALUES (1, '/manga', 'test-plugin', 'Test Manga')
    `);
    sqlite.executeSync(`
      INSERT INTO MangaChapter (id, mangaId, path, name, unread)
      VALUES (1, 1, '/manga/c1', 'Chapter 1', 1)
    `);

    sqlite.executeSync(`
      UPDATE MangaChapter
      SET unread = 0, readTime = '2026-08-03T10:00:00.000Z'
      WHERE id = 1
    `);

    expect(mangaStats()).toMatchObject({
      chaptersUnread: 0,
      lastReadAt: '2026-08-03T10:00:00.000Z',
    });
  });

  it('recomputes counters and totalChapters when a chapter is deleted', () => {
    const { sqlite } = getTestDb();
    sqlite.executeSync(`
      INSERT INTO Manga (id, path, pluginId, name)
      VALUES (1, '/manga', 'test-plugin', 'Test Manga')
    `);
    sqlite.executeSync(`
      INSERT INTO MangaChapter (id, mangaId, path, name, unread, isDownloaded)
      VALUES
        (1, 1, '/manga/c1', 'Chapter 1', 1, 1),
        (2, 1, '/manga/c2', 'Chapter 2', 1, 0)
    `);
    expect(mangaStats()).toMatchObject({
      chaptersDownloaded: 1,
      chaptersUnread: 2,
      totalChapters: 2,
    });

    sqlite.executeSync('DELETE FROM MangaChapter WHERE id = 1');

    expect(mangaStats()).toMatchObject({
      chaptersDownloaded: 0,
      chaptersUnread: 1,
      totalChapters: 1,
    });
  });
});
