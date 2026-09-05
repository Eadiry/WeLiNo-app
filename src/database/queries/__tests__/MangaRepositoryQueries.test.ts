/**
 * Tests for MangaRepositoryQueries — a real in-memory database, mirroring
 * VoiceRepositoryQueries.test.ts.
 */

import './mockDb';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { clearAllTables } from './testData';

import {
  getMangaRepositoriesFromDb,
  getEnabledMangaRepositoriesFromDb,
  isMangaRepoUrlDuplicated,
  createMangaRepository,
  deleteMangaRepositoryById,
  setMangaRepositoryEnabled,
  updateMangaRepository,
} from '../MangaRepositoryQueries';

describe('MangaRepositoryQueries', () => {
  beforeEach(() => {
    const testDb = setupTestDatabase();
    clearAllTables(testDb);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('creates a repository enabled by default and lists it', async () => {
    const created = await createMangaRepository(
      'https://manga.example.com/index.json',
    );

    expect(created.id).toBeGreaterThan(0);
    expect(created.url).toBe('https://manga.example.com/index.json');
    expect(created.enabled).toBe(true);

    const all = await getMangaRepositoriesFromDb();
    expect(all.map(r => r.url)).toEqual([
      'https://manga.example.com/index.json',
    ]);
  });

  it('lists only enabled repositories, ordered by id', async () => {
    const a = await createMangaRepository('https://a.example.com/index.json');
    const b = await createMangaRepository('https://b.example.com/index.json');
    await setMangaRepositoryEnabled(a.id, false);

    const enabled = await getEnabledMangaRepositoriesFromDb();
    expect(enabled.map(r => r.id)).toEqual([b.id]);
  });

  it('detects duplicate urls', async () => {
    const url = 'https://dup.example.com/index.json';
    await createMangaRepository(url);

    expect(await isMangaRepoUrlDuplicated(url)).toBe(true);
    expect(await isMangaRepoUrlDuplicated('https://other.example.com')).toBe(
      false,
    );
  });

  it('updates a repository url', async () => {
    const created = await createMangaRepository(
      'https://old.example.com/index.json',
    );
    await updateMangaRepository(
      created.id,
      'https://new.example.com/index.json',
    );

    const [updated] = await getMangaRepositoriesFromDb();
    expect(updated.url).toBe('https://new.example.com/index.json');
  });

  it('deletes a repository', async () => {
    const created = await createMangaRepository(
      'https://gone.example.com/index.json',
    );
    await deleteMangaRepositoryById(created.id);

    expect(await getMangaRepositoriesFromDb()).toEqual([]);
  });
});
