/**
 * Tests for NameSubstitutionQueries — a real in-memory database, mirroring
 * VoiceRepositoryQueries.test.ts.
 */

import './mockDb';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { clearAllTables } from './testData';

import {
  getNameSubstitutions,
  createNameSubstitution,
  updateNameSubstitution,
  deleteNameSubstitution,
  deleteNameSubstitutionsForNovel,
  moveNameSubstitution,
  type NameSubstitutionDraft,
} from '../NameSubstitutionQueries';

const draft = (
  over: Partial<NameSubstitutionDraft> = {},
): NameSubstitutionDraft => ({
  pattern: 'Han Li',
  replacement: 'Han',
  kind: 'plain',
  wholeWord: true,
  caseSensitive: false,
  preserveCase: true,
  enabled: true,
  note: null,
  ...over,
});

describe('NameSubstitutionQueries', () => {
  beforeEach(() => {
    const testDb = setupTestDatabase();
    clearAllTables(testDb);
  });

  afterAll(() => {
    teardownTestDatabase();
  });

  it('creates rules per novel, appended in order, and lists them scoped', async () => {
    const a = await createNameSubstitution(1, draft({ pattern: 'A' }));
    const b = await createNameSubstitution(1, draft({ pattern: 'B' }));
    await createNameSubstitution(2, draft({ pattern: 'C' }));

    expect(a.position).toBeLessThan(b.position);

    const novel1 = await getNameSubstitutions(1);
    expect(novel1.map(r => r.pattern)).toEqual(['A', 'B']);
    expect(novel1[0].novelId).toBe(1);

    const novel2 = await getNameSubstitutions(2);
    expect(novel2.map(r => r.pattern)).toEqual(['C']);
  });

  it('updates a rule in place', async () => {
    const r = await createNameSubstitution(1, draft());
    await updateNameSubstitution(r.id, {
      replacement: 'Li',
      enabled: false,
      kind: 'regex',
    });

    const [updated] = await getNameSubstitutions(1);
    expect(updated.replacement).toBe('Li');
    expect(updated.enabled).toBe(false);
    expect(updated.kind).toBe('regex');
  });

  it('deletes one rule and all rules for a novel', async () => {
    const r1 = await createNameSubstitution(1, draft({ pattern: 'A' }));
    await createNameSubstitution(1, draft({ pattern: 'B' }));
    await createNameSubstitution(2, draft({ pattern: 'C' }));

    await deleteNameSubstitution(r1.id);
    expect((await getNameSubstitutions(1)).map(r => r.pattern)).toEqual(['B']);

    await deleteNameSubstitutionsForNovel(1);
    expect(await getNameSubstitutions(1)).toEqual([]);
    expect((await getNameSubstitutions(2)).map(r => r.pattern)).toEqual(['C']);
  });

  it('reorders rules with move up / down', async () => {
    await createNameSubstitution(1, draft({ pattern: 'A' }));
    const b = await createNameSubstitution(1, draft({ pattern: 'B' }));
    await createNameSubstitution(1, draft({ pattern: 'C' }));

    await moveNameSubstitution(b.id, 'up');
    expect((await getNameSubstitutions(1)).map(r => r.pattern)).toEqual([
      'B',
      'A',
      'C',
    ]);

    await moveNameSubstitution(b.id, 'down');
    expect((await getNameSubstitutions(1)).map(r => r.pattern)).toEqual([
      'A',
      'B',
      'C',
    ]);

    // no-op at the edges
    await moveNameSubstitution(b.id, 'up');
    await moveNameSubstitution(b.id, 'up');
    expect((await getNameSubstitutions(1)).map(r => r.pattern)).toEqual([
      'B',
      'A',
      'C',
    ]);
  });
});
