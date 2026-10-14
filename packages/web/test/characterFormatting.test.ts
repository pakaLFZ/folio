import { describe, expect, it } from 'vitest';
import { parseMarkup } from '@folio/core';
import { POWERPOINT_SIZES, selectionStyle, stepFontSize } from '../src/slide/characterFormatting';

describe('PowerPoint font size steps', () => {
  it('uses every adjacent step in the PowerPoint list in both directions', () => {
    for (let i = 0; i < POWERPOINT_SIZES.length - 1; i++) {
      expect(stepFontSize(POWERPOINT_SIZES[i]!, 1)).toBe(POWERPOINT_SIZES[i + 1]);
      expect(stepFontSize(POWERPOINT_SIZES[i + 1]!, -1)).toBe(POWERPOINT_SIZES[i]);
    }
  });

  it('moves from off-list values to the nearest step and stops at the endpoints', () => {
    expect(stepFontSize(13, 1)).toBe(14);
    expect(stepFontSize(13, -1)).toBe(12);
    expect(stepFontSize(1, -1)).toBe(8);
    expect(stepFontSize(200, 1)).toBe(96);
  });
});

describe('selected character values', () => {
  it('shows the effective base size and only fully applied toggles', () => {
    const runs = parseMarkup('A[[size=24;color=red;bold|BC]][[size=24;color=red|D]]');
    expect(selectionStyle(runs, 1, 3, 18)).toMatchObject({ size: 24, color: 'red', bold: true });
    expect(selectionStyle(runs, 1, 4, 18)).toMatchObject({ size: 24, color: 'red', bold: false });
    expect(selectionStyle(runs, 0, 4, 18)).toMatchObject({ size: undefined, color: undefined, bold: false });
  });
});
