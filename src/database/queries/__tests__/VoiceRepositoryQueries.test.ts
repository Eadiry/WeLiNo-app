/**
 * Tests for VoiceRepositoryQueries — a real in-memory database, mirroring
 * RepositoryQueries.test.ts.
 */

import './mockDb';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { clearAllTables } from './testData';

import {
  getVoiceRepositoriesFromDb,
  getEnabledVoiceRepositoriesFromDb,
  isVoiceRepoUrlDuplicated,
  createVoiceRepository,
  deleteVoiceRepositoryById,
  setVoiceRepositoryEnabled,
  updateVoiceRepository,
} from '../VoiceRepositoryQueries';

describe('VoiceRepositoryQueries', () => {
  beforeEach(() => {
    const testDb = setupTestDatabase();
    clearAllTables(testDb);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('creates a repository enabled by default and lists it', async () => {
    const created = await createVoiceRepository(
      'https://voices.example.com/voices.json',
    );

    expect(created.id).toBeGreaterThan(0);
    expect(created.url).toBe('https://voices.example.com/voices.json');
    expect(created.enabled).toBe(true);

    const all = await getVoiceRepositoriesFromDb();
    expect(all.map(r => r.url)).toEqual([
      'https://voices.example.com/voices.json',
    ]);
  });

  it('getEnabledVoiceRepositoriesFromDb excludes disabled rows', async () => {
    const a = await createVoiceRepository('https://a.example.com/voices.json');
    await createVoiceRepository('https://b.example.com/voices.json');
    await setVoiceRepositoryEnabled(a.id, false);

    const enabled = await getEnabledVoiceRepositoriesFromDb();
    expect(enabled.map(r => r.url)).toEqual([
      'https://b.example.com/voices.json',
    ]);
  });

  it('isVoiceRepoUrlDuplicated is exact-match', async () => {
    await createVoiceRepository('https://x.example.com/voices.json');

    expect(
      await isVoiceRepoUrlDuplicated('https://x.example.com/voices.json'),
    ).toBe(true);
    expect(
      await isVoiceRepoUrlDuplicated('https://x.example.com/other.json'),
    ).toBe(false);
  });

  it('updates and deletes a repository', async () => {
    const row = await createVoiceRepository(
      'https://old.example.com/voices.json',
    );

    await updateVoiceRepository(row.id, 'https://new.example.com/voices.json');
    expect((await getVoiceRepositoriesFromDb())[0].url).toBe(
      'https://new.example.com/voices.json',
    );

    await deleteVoiceRepositoryById(row.id);
    expect(await getVoiceRepositoriesFromDb()).toEqual([]);
  });
});
