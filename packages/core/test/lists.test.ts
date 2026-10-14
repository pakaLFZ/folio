import { describe, expect, it } from 'vitest';
import { listProblems, parseParagraphs } from '../src/index.js';

describe('list paragraphs', () => {
  it('parses nested markers and styled item content', () => {
    const paragraphs = parseParagraphs('- [[bold|First]]\n  - child\n    - last\n1. one\n42. two');
    expect(paragraphs.map(({ kind, level, marker }) => [kind, level, marker])).toEqual([
      ['bullet', 1, '•'], ['bullet', 2, '–'], ['bullet', 3, '▪'],
      ['number', 1, '1.'], ['number', 1, '2.'],
    ]);
    expect(paragraphs[0]!.runs[0]).toMatchObject({ text: 'First', bold: true });
  });
  it('continues an outer run past a nested one and restarts after an interruption', () => {
    expect(parseParagraphs('8. one\n  3. sub\n  7. sub\n9. outer\n  5. sub again\nplain\n2. again').map((p) => p.marker)).toEqual(['1.', 'a.', 'b.', '2.', 'a.', '', '1.']);
    expect(parseParagraphs('1. one\n- bullet\n1. two').map((p) => p.marker)).toEqual(['1.', '•', '1.']);
    expect(parseParagraphs('    3. first\n    9. second').map((p) => p.marker)).toEqual(['i.', 'ii.']);
  });
  it('reports bad indentation by slot line', () => {
    expect(listProblems('- valid\n - bad\n      1. too deep')).toEqual([
      'line 2: list indentation must be 0, 2, or 4 spaces (levels 1–3); repair the leading spaces',
      'line 3: list indentation must be 0, 2, or 4 spaces (levels 1–3); repair the leading spaces',
    ]);
  });
  it('treats escaped leading hyphen as plain text', () => {
    expect(parseParagraphs('\\- literal')[0]).toMatchObject({ kind: null, runs: [{ text: '- literal' }] });
    expect(parseParagraphs('\\1. literal')[0]).toMatchObject({ kind: null, runs: [{ text: '1. literal' }] });
  });
});
