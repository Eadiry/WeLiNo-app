import {
  applySubstitutions,
  type NameSubstitutionRule,
} from '../nameSubstitution';

let nextId = 1;
const rule = (over: Partial<NameSubstitutionRule>): NameSubstitutionRule => ({
  id: nextId++,
  novelId: 1,
  pattern: '',
  replacement: '',
  kind: 'plain',
  wholeWord: true,
  caseSensitive: false,
  preserveCase: true,
  enabled: true,
  position: 0,
  note: null,
  ...over,
});

beforeEach(() => {
  nextId = 1;
});

describe('applySubstitutions', () => {
  it('replaces a plain name everywhere, whole-word', () => {
    const rules = [
      rule({ pattern: 'Han Li', replacement: 'Han', position: 1 }),
    ];
    const { text, counts } = applySubstitutions(
      'Han Li smiled. Then Han Li left.',
      rules,
    );
    expect(text).toBe('Han smiled. Then Han left.');
    expect(counts[rules[0].id]).toBe(2);
  });

  it('whole-word avoids matching inside other words', () => {
    const rules = [
      rule({
        pattern: 'Han',
        replacement: 'John',
        wholeWord: true,
        position: 1,
      }),
    ];
    const { text } = applySubstitutions('Han handed the handle to Han.', rules);
    expect(text).toBe('John handed the handle to John.');
  });

  it('is case-insensitive by default and can echo the match case', () => {
    const rules = [
      rule({
        pattern: 'qin',
        replacement: 'chin',
        preserveCase: true,
        position: 1,
      }),
    ];
    const { text } = applySubstitutions(
      'QIN shouted, then Qin whispered, then qin left.',
      rules,
    );
    expect(text).toBe('CHIN shouted, then Chin whispered, then chin left.');
  });

  it('respects case sensitivity when asked', () => {
    const rules = [
      rule({
        pattern: 'qin',
        replacement: 'chin',
        caseSensitive: true,
        wholeWord: true,
        position: 1,
      }),
    ];
    const { text } = applySubstitutions('Qin and qin', rules);
    expect(text).toBe('Qin and chin');
  });

  it('chains rules in position order', () => {
    const rules = [
      rule({
        pattern: '韩立',
        replacement: 'Han Li',
        wholeWord: false,
        position: 1,
      }),
      rule({ pattern: 'Han Li', replacement: 'Han', position: 2 }),
    ];
    const { text } = applySubstitutions('村里的韩立走了。', rules);
    expect(text).toBe('村里的Han走了。');
  });

  it('supports regex rules with capture groups', () => {
    const rules = [
      rule({
        pattern: '\\b([A-Z])(\\d{2})\\b',
        replacement: 'Unit-$1$2',
        kind: 'regex',
        position: 1,
      }),
    ];
    const { text } = applySubstitutions(
      'Agents A01 and B07 reported in.',
      rules,
    );
    expect(text).toBe('Agents Unit-A01 and Unit-B07 reported in.');
  });

  it('skips disabled rules and reports invalid patterns', () => {
    const rules = [
      rule({
        pattern: 'Han',
        replacement: 'John',
        enabled: false,
        position: 1,
      }),
      rule({
        pattern: '(unclosed',
        replacement: 'x',
        kind: 'regex',
        position: 2,
      }),
    ];
    const { text, invalid } = applySubstitutions('Han stayed.', rules);
    expect(text).toBe('Han stayed.');
    expect(invalid).toEqual([rules[1].id]);
  });
});
