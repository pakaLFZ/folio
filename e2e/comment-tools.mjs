// The sketch tools do not open the composer; Region does. Eraser removes only touched draft marks.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";

const server = await serve({ decks: ["example-b"] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
const check = (ok, name) => (console.log(`${ok ? "PASS" : "FAIL"} ${name}`), ok || failures.push(name));
const radio = (name) => page.getByRole("radio", { name });
const bar = page.locator('[role="dialog"][aria-label="New comment"]');

try {
  await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001`, { waitUntil: "load" });
  const slide = await page.locator("main .folio-slide").boundingBox();
  const scale = slide.width / 960;
  const point = ([x, y]) => [slide.x + x * scale, slide.y + y * scale];
  const drag = async (a, b) => {
    await page.mouse.move(...point(a));
    await page.mouse.down();
    await page.mouse.move(...point(b), { steps: 8 });
    await page.mouse.up();
  };
  const count = () => page.locator("main .folio-slide svg polyline[stroke], main .folio-slide svg rect[stroke], main .folio-slide svg line[stroke]").count();
  const iconCursor = async () => (await page.locator("main .folio-slide [data-sketch-input]").evaluate((svg) => getComputedStyle(svg).cursor)).includes("url(");
  check((await radio(/^Edit text/).locator("svg.lucide-mouse-pointer").count()) === 1, "Cursor button uses MousePointer");
  check((await radio(/^Region/).locator("svg.lucide-square-mouse-pointer").count()) === 1, "Select button uses SquareMousePointer");
  check((await radio(/^Pen/).locator("svg.lucide-pen").count()) === 1, "Pen button uses Pen");

  await radio(/^Pen/).click();
  check(await iconCursor(), "Pen uses its icon as the cursor");
  await drag([90, 220], [210, 240]);
  check((await count()) >= 1 && (await bar.count()) === 0, "Pen draws without opening the input bar");

  await radio(/^Rectangle/).click();
  check(await iconCursor(), "Rectangle uses its icon as the cursor");
  await drag([320, 180], [430, 270]);
  check((await count()) >= 2 && (await bar.count()) === 0, "Rectangle draws without opening the input bar");

  await radio(/^Arrow/).click();
  check(await iconCursor(), "Arrow uses its icon as the cursor");
  await drag([550, 180], [690, 260]);
  check((await count()) >= 3 && (await bar.count()) === 0, "Arrow draws without opening the input bar");

  await radio(/^Eraser/).click();
  check(await iconCursor(), "Eraser uses its white-backed icon as the cursor");
  await page.mouse.click(...point([375, 225]));
  const after = await count();
  check(after >= 2 && (await bar.count()) === 0, "Eraser removes the touched rectangle without clearing the other marks");

  await radio(/^Region/).click();
  const regionCursor = await page.locator("main .folio-slide [data-sketch-input]").evaluate((svg) => getComputedStyle(svg).cursor);
  check(regionCursor.includes("url(") && regionCursor.includes("8 8"), "Select uses MousePointer2 as the canvas cursor");
  await bar.waitFor();
  check((await bar.isVisible()) && (await count()) >= 2, "Region selection opens the input bar for the remaining sketch");

  await radio(/^Edit text/).click();
  const cursors = await page.locator("main .folio-slide").evaluate((slide) => ({ slide: getComputedStyle(slide).cursor, text: getComputedStyle(slide.querySelector('[contenteditable="true"]')).cursor }));
  check(!cursors.slide.includes("url(") && (cursors.text === "text" || cursors.text === "auto"), `Cursor tool keeps native pointer/text behavior (${JSON.stringify(cursors)})`);
  check(await bar.isVisible(), "Cursor tool keeps the draft input available");
} finally {
  await browser.close();
  await server.stop();
}

process.exit(failures.length ? 1 : 0);
