import { asc, eq, max } from 'drizzle-orm';
import { dbManager } from '@database/db';
import {
  nameSubstitutionSchema,
  type NameSubstitutionRow,
} from '@database/schema';
import type { NameSubstitutionRule } from '@services/nameSubstitution';

const toRule = (row: NameSubstitutionRow): NameSubstitutionRule => ({
  id: row.id,
  novelId: row.novelId,
  pattern: row.pattern,
  replacement: row.replacement,
  kind: row.kind === 'regex' ? 'regex' : 'plain',
  wholeWord: row.wholeWord,
  caseSensitive: row.caseSensitive,
  preserveCase: row.preserveCase,
  enabled: row.enabled,
  position: row.position,
  note: row.note,
});

/** All rules for a novel, in apply (`position`) order. */
export const getNameSubstitutions = async (
  novelId: number,
): Promise<NameSubstitutionRule[]> => {
  const rows = await dbManager
    .select()
    .from(nameSubstitutionSchema)
    .where(eq(nameSubstitutionSchema.novelId, novelId))
    .orderBy(
      asc(nameSubstitutionSchema.position),
      asc(nameSubstitutionSchema.id),
    )
    .all();
  return rows.map(toRule);
};

export type NameSubstitutionDraft = Pick<
  NameSubstitutionRule,
  | 'pattern'
  | 'replacement'
  | 'kind'
  | 'wholeWord'
  | 'caseSensitive'
  | 'preserveCase'
  | 'enabled'
  | 'note'
>;

/** Appends a rule at the end of the novel's list. */
export const createNameSubstitution = async (
  novelId: number,
  draft: NameSubstitutionDraft,
): Promise<NameSubstitutionRule> => {
  const row = await dbManager.write(async tx => {
    const { value } = (await tx
      .select({ value: max(nameSubstitutionSchema.position) })
      .from(nameSubstitutionSchema)
      .where(eq(nameSubstitutionSchema.novelId, novelId))
      .get()) ?? { value: null };
    return tx
      .insert(nameSubstitutionSchema)
      .values({ ...draft, novelId, position: (value ?? 0) + 1 })
      .returning()
      .get();
  });
  return toRule(row);
};

export const updateNameSubstitution = async (
  id: number,
  patch: Partial<NameSubstitutionDraft>,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .update(nameSubstitutionSchema)
      .set(patch)
      .where(eq(nameSubstitutionSchema.id, id))
      .run();
  });
};

export const deleteNameSubstitution = async (id: number): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(nameSubstitutionSchema)
      .where(eq(nameSubstitutionSchema.id, id))
      .run();
  });
};

export const deleteNameSubstitutionsForNovel = async (
  novelId: number,
): Promise<void> => {
  await dbManager.write(async tx => {
    await tx
      .delete(nameSubstitutionSchema)
      .where(eq(nameSubstitutionSchema.novelId, novelId))
      .run();
  });
};

/** Swaps the `position` of a rule with its neighbour in the given direction. */
export const moveNameSubstitution = async (
  id: number,
  direction: 'up' | 'down',
): Promise<void> => {
  await dbManager.write(async tx => {
    const rule = await tx
      .select()
      .from(nameSubstitutionSchema)
      .where(eq(nameSubstitutionSchema.id, id))
      .get();
    if (!rule) return;

    const siblings = await tx
      .select()
      .from(nameSubstitutionSchema)
      .where(eq(nameSubstitutionSchema.novelId, rule.novelId))
      .orderBy(
        asc(nameSubstitutionSchema.position),
        asc(nameSubstitutionSchema.id),
      )
      .all();

    const i = siblings.findIndex(s => s.id === id);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= siblings.length) return;

    const a = siblings[i];
    const b = siblings[j];
    await tx
      .update(nameSubstitutionSchema)
      .set({ position: b.position })
      .where(eq(nameSubstitutionSchema.id, a.id))
      .run();
    await tx
      .update(nameSubstitutionSchema)
      .set({ position: a.position })
      .where(eq(nameSubstitutionSchema.id, b.id))
      .run();
  });
};
