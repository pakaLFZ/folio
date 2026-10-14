import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve, until } from './lib/server.mjs';

const server = await serve({ decks: ['example-b'] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const slideFile = join(server.deckDir('example-b'), 'slides/s001.json');
const slide = JSON.parse(readFileSync(slideFile, 'utf8'));
slide.elements.s.props.note = '';
writeFileSync(slideFile, JSON.stringify(slide, null, 2));
const caption = () => JSON.parse(readFileSync(slideFile, 'utf8')).elements.s.props.note;
const slot = page.locator('main [data-slot="note"] .folio-text');
const results = [];
const check = (name, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

async function caretAtStart() {
  await slot.evaluate((el) => { el.focus(); getSelection().collapse(el, 0); });
}

async function selectFirst() {
  await slot.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(5, node.textContent.length));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

try {
  await page.goto(server.base + '/' + server.token('example-b') + '/?slide=s001', { waitUntil: 'load' });
  await caretAtStart();
  await page.keyboard.type('- ');
  check('typed hyphen converts to a bullet', await slot.locator('[data-list="bullet"][data-marker="•"]').count() === 1);
  await page.keyboard.press('ControlOrMeta+z');
  check('immediate undo restores typed prefix', await slot.locator('[data-list]').count() === 0 && await slot.textContent() === '- ');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('- ');
  await page.keyboard.type('First item');
  await page.keyboard.press('Enter');
  check('Enter continues the bullet list', await slot.locator('[data-list="bullet"]').count() === 2);
  await page.keyboard.type('Second item');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('continued');
  check('Shift+Enter stays inside the item', await slot.locator('[data-list]').count() === 2);
  await page.keyboard.press('Tab');
  check('Tab nests to level two', await slot.locator('[data-level="2"][data-marker="–"]').count() === 1);
  await page.keyboard.press('Shift+Tab');
  check('Shift+Tab outdents', await slot.locator('[data-level="1"][data-list="bullet"]').count() === 2);
  await page.keyboard.press('ControlOrMeta+Shift+7');
  check('Ctrl+Shift+7 switches the item to numbering', await slot.locator('[data-list="number"][data-marker="1."]').count() === 1);
  await selectFirst();
  const toolbar = page.locator('[data-rich-text-toolbar]');
  check('toolbar exposes both list toggles', await toolbar.getByRole('button', { name: 'Bullets' }).count() === 1 && await toolbar.getByRole('button', { name: 'Numbering' }).count() === 1);
  check('bullet toggle reflects the selected item', await toolbar.getByRole('button', { name: 'Bullets' }).getAttribute('aria-pressed') === 'true');
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await until(() => caption().includes('1. Second item'));
  check('stored slot keeps list prefixes', caption().includes('- First item\n1. Second item'));
  check('soft break stays inside the stored item', caption().includes('Second item\u2028continued'));
  await page.reload({ waitUntil: 'load' });
  check('reload renders the same list paragraphs', !!await until(async () => await slot.locator('[data-list]').count() === 2));
  await slot.evaluate((el) => {
    const node = el.querySelectorAll('[data-paragraph]')[1].firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 6);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('ControlOrMeta+b');
  check('character formatting stays on text in the second item', await slot.locator('[data-paragraph]:nth-child(2) b').innerText() === 'Second');
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await until(() => caption().includes('**Second**'));
  check('styled list text saves without changing its marker', caption().includes('1. **Second**'));
  await page.getByRole('radio', { name: 'View' }).click();
  check('View uses the same list markers', await slot.locator('[data-marker="•"]').count() === 1 && await slot.locator('[data-marker="1."]').count() === 1);
  await page.getByRole('radio', { name: 'Edit' }).click();
  await selectFirst();
  await page.locator('[data-rich-text-toolbar]').getByRole('button', { name: 'Bullets' }).click();
  check('toolbar Bullets toggles the selected paragraph off', await slot.locator('[data-list="bullet"]').count() === 0);
  await slot.evaluate((el) => { const first = el.querySelector('[data-paragraph]'); el.focus(); getSelection().collapse(first, 0); });
  await page.keyboard.press('ControlOrMeta+Shift+8');
  await page.keyboard.press('Backspace');
  check('Backspace at item start removes its marker', await slot.locator('[data-list="bullet"]').count() === 0);
} finally {
  await browser.close();
  await server.stop();
}

console.log(`Tests ${results.filter(Boolean).length} passed (${results.length})`);
if (results.some((ok) => !ok)) process.exitCode = 1;
