// Character styling in Edit, persistence, View, print and native PowerPoint runs.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { serve, until } from './lib/server.mjs';

const requireServer = createRequire(new URL('../packages/server/package.json', import.meta.url));
const { unzipSync, strFromU8 } = requireServer('fflate');
const server = await serve({ decks: ['example-b'] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const slideFile = join(server.deckDir('example-b'), 'slides/s001.json');
const caption = () => JSON.parse(readFileSync(slideFile, 'utf8')).elements.s.props.caption;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  ' + detail); };
const base = server.base + '/' + server.token('example-b');
const slot = page.locator('main [data-slot="caption"] .folio-text');
const toolbar = page.locator('[data-rich-text-toolbar]');
const sizeField = toolbar.getByRole('spinbutton', { name: 'Font size' });
const sizes = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const selectedText = () => slot.evaluate((el) => {
  const selection = getSelection();
  return selection?.anchorNode && el.contains(selection.anchorNode) ? selection.toString() : '';
});
const pressed = async (name) => (await toolbar.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')) === 'true';

async function selectWord(word) {
  await slot.click();
  await slot.evaluate((el, text) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const start = (node.textContent ?? '').indexOf(text);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return;
    }
    throw new Error('word not found: ' + text);
  }, word);
}

try {
  await page.goto(base + '/?slide=s001', { waitUntil: 'load' });
  await selectWord('second');
  check('selection opens floating character toolbar immediately', await toolbar.isVisible());
  const baseSize = Number(await sizeField.inputValue());
  check('size field shows the selected text size in pt', baseSize > 0, String(baseSize));
  const selectedBox = await slot.evaluate((el) => getSelection().getRangeAt(0).getBoundingClientRect().toJSON());
  const toolbarBox = await toolbar.boundingBox();
  check('toolbar is anchored above the selection', !!toolbarBox && toolbarBox.y + toolbarBox.height <= selectedBox.top + 2);
  await slot.evaluate((el) => { const selection = getSelection(); selection.collapseToEnd(); document.dispatchEvent(new Event('selectionchange')); });
  check('toolbar hides when selection collapses', await toolbar.count() === 0);
  const wordBox = await slot.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 2);
    return range.getBoundingClientRect().toJSON();
  });
  await page.mouse.dblclick(wordBox.left + wordBox.width / 2, wordBox.top + wordBox.height / 2);
  check('double-click selection opens toolbar without another click', (await selectedText()).length > 0 && await toolbar.isVisible());
  await slot.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    getSelection().collapse(node, 0);
    document.dispatchEvent(new Event('selectionchange'));
  });
  await page.keyboard.press('Shift+ArrowRight');
  check('Shift+arrow selection opens toolbar immediately', (await selectedText()).length === 1 && await toolbar.isVisible());
  await slot.evaluate((el) => { getSelection().collapseToStart(); document.dispatchEvent(new Event('selectionchange')); });
  const drag = await slot.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    const one = document.createRange();
    one.setStart(node, 0); one.setEnd(node, 1);
    const more = document.createRange();
    more.setStart(node, 0); more.setEnd(node, Math.min(5, node.textContent.length));
    return { start: one.getBoundingClientRect().toJSON(), end: more.getBoundingClientRect().toJSON() };
  });
  await page.mouse.move(drag.start.left + 1, drag.start.top + drag.start.height / 2);
  await page.mouse.down();
  await page.mouse.move(drag.end.right - 1, drag.end.top + drag.end.height / 2, { steps: 4 });
  await page.mouse.up();
  check('mouse drag selection opens toolbar without another click', (await selectedText()).length > 0 && await toolbar.isVisible());
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  check('toolbar hides when selection leaves the slot', await toolbar.count() === 0);
  await selectWord('second');
  await page.getByRole('spinbutton', { name: 'Font size' }).fill('24');
  await page.getByRole('combobox', { name: 'Colour' }).selectOption('magenta');
  await until(() => caption().includes('size=24') && caption().includes('color=magenta'));
  check('size and pack colour save on just the selected word', caption().includes('[[size=24;color=magenta|second]]'), caption());
  check('toolbar shows the selection colour and font', (await toolbar.getByRole('combobox', { name: 'Colour' }).inputValue()) === 'magenta' && (await toolbar.getByLabel('Colour swatch').evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgba(0, 0, 0, 0)' && (await toolbar.getByRole('combobox', { name: 'Font family' }).inputValue()).length > 0);
  await slot.evaluate((el) => { const range = document.createRange(); range.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event('selectionchange')); });
  check('mixed sizes leave the size field blank', (await sizeField.inputValue()) === '');
  await selectWord('caption');
  await page.keyboard.press('ControlOrMeta+Shift+>');
  await page.keyboard.press('ControlOrMeta+i');
  await page.locator('main').click({ position: { x: 5, y: 5 } });
  await until(() => caption().includes('italic'));
  check('keyboard size step and italic save', caption().includes('italic') && caption().includes('size='), caption());
  await selectWord('caption');
  await page.keyboard.press('ControlOrMeta+z');
  await until(() => !caption().includes('italic'));
  check('undo restores the prior slot text', !caption().includes('italic'), caption());
  await selectWord('caption');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await until(() => caption().includes('italic'));
  check('redo restores the formatting', caption().includes('italic'), caption());
  await selectWord('deck');
  const startingSize = Number(await sizeField.inputValue());
  await page.keyboard.press('ControlOrMeta+Shift+>');
  const steppedUp = sizes.find((n) => n > startingSize) ?? 96;
  check('Ctrl+Shift+> uses next PowerPoint size and keeps selection', Number(await sizeField.inputValue()) === steppedUp && (await selectedText()) === 'deck');
  await page.keyboard.press('ControlOrMeta+Shift+<');
  const steppedDown = [...sizes].reverse().find((n) => n < steppedUp) ?? 8;
  check('Ctrl+Shift+< uses previous PowerPoint size', Number(await sizeField.inputValue()) === steppedDown && (await selectedText()) === 'deck');
  await page.keyboard.press('ControlOrMeta+]');
  check('Ctrl+] adds 1 pt', Number(await sizeField.inputValue()) === steppedDown + 1 && (await selectedText()) === 'deck');
  await page.keyboard.press('ControlOrMeta+[');
  check('Ctrl+[ removes 1 pt', Number(await sizeField.inputValue()) === steppedDown && (await selectedText()) === 'deck');
  for (const [key, name] of [['b', 'Bold'], ['i', 'Italic'], ['u', 'Underline']]) {
    await page.keyboard.press('ControlOrMeta+' + key);
    check('Ctrl+' + key.toUpperCase() + ' toggles ' + name, await pressed(name) && (await selectedText()) === 'deck');
  }
  const pageScale = await page.evaluate(() => devicePixelRatio);
  await page.keyboard.press('ControlOrMeta+=');
  check('Ctrl+= toggles subscript without page zoom', await pressed('Subscript') && (await selectedText()) === 'deck' && (await page.evaluate(() => devicePixelRatio)) === pageScale);
  await page.keyboard.press('ControlOrMeta+Shift+=');
  check('Ctrl+Shift+= toggles superscript', await pressed('Superscript') && !await pressed('Subscript') && (await selectedText()) === 'deck');
  await page.keyboard.press('ControlOrMeta+Shift+=');
  check('Ctrl+Shift+= toggles superscript off', !await pressed('Superscript') && (await selectedText()) === 'deck');
  await page.keyboard.press('ControlOrMeta+Space');
  check('Ctrl+Space clears character formatting and keeps selection', Number(await sizeField.inputValue()) === startingSize && !await pressed('Bold') && !await pressed('Italic') && !await pressed('Underline') && (await selectedText()) === 'deck' && (await page.evaluate(() => devicePixelRatio)) === pageScale);
  await selectWord('second');
  await page.keyboard.press('ControlOrMeta+]');
  check('toolbar follows changed selection and shows its current size', Number(await sizeField.inputValue()) === 25 && (await selectedText()) === 'second');
  await page.keyboard.press('ControlOrMeta+[');
  await page.reload({ waitUntil: 'load' });
  const styledRun = slot.locator('[data-run-size="24"][data-run-color="magenta"]');
  check('reload restores inline size and colour', (await until(async () => (await styledRun.count()) === 1)) === true);
  await page.getByRole('radio', { name: 'View', exact: true }).click();
  check('View renders the same styled word', await slot.locator('[data-run-size="24"]').count() === 1);
  const print = await browser.newPage();
  await print.goto(base + '/?print=1&slides=s001', { waitUntil: 'load' });
  await print.waitForFunction(() => window.__FOLIO_READY__ === true);
  check('print page carries the same styled word', await print.locator('section[data-slide="s001"] [data-slot="caption"] [data-run-size="24"]').count() === 1);
  await print.close();
  const response = await page.request.post(base + '/export-pptx', { timeout: 180000 });
  const files = unzipSync(Buffer.from(await response.body()));
  const xml = strFromU8(files['ppt/slides/slide1.xml']);
  const captionShape = xml.slice(xml.indexOf('name="caption"'), xml.indexOf('</p:sp>', xml.indexOf('name="caption"')));
  check('PPTX uses editable runs with size and colour', response.ok() && /<a:r><a:rPr[^>]*sz="2400"/.test(captionShape) && captionShape.includes('9C2E6B') && captionShape.includes('<a:t xml:space="preserve">second</a:t>'));
} finally {
  await browser.close();
  await server.stop();
}
console.log(results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
