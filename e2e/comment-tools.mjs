// The sketch tools do not open the composer; Region does. Eraser removes only touched draft marks.
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serve, until } from "./lib/server.mjs";

const server = await serve({ decks: ["example-b"] });
const deck = server.deckDir("example-b");
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
  const sketch = () => page.locator('[data-sketch-input]').locator("xpath=..");
  const count = () => sketch().locator("svg polyline[stroke], svg rect[stroke], svg line[stroke]").count();
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

  // Switching slides must not lose, or silently merge into, a mark drawn before the switch
  // (spec/comments/region-comments.md: "a draft mark persists until the user clears it").
  await radio(/^Pen/).click();
  const beforeSwitch = await count();
  await page.keyboard.press("PageDown");
  await page.waitForFunction(() => new URLSearchParams(location.search).get("slide") === "s003");
  await page.waitForTimeout(300);
  const onS003Before = await count();
  check(onS003Before === 0, `switching to another slide shows none of the first slide's marks (got ${onS003Before}, had ${beforeSwitch})`);
  await drag([120, 150], [300, 150]);
  const onS003After = await count();
  check(onS003After === onS003Before + 1, `a mark drawn on the new slide shows on it at once (${onS003Before} -> ${onS003After})`);
  await page.keyboard.press("PageUp");
  await page.waitForFunction(() => new URLSearchParams(location.search).get("slide") === "s001");
  await page.waitForTimeout(300);
  const onS001After = await count();
  check(onS001After === beforeSwitch, `switching back restores the first slide's own marks, unchanged by the one drawn elsewhere (${beforeSwitch} -> ${onS001After})`);

  // A rectangle drawn with the Rectangle tool, then sent from the Comments tab's own bottom
  // composer (not the on-slide bubble), must carry the rectangle: "I draw a box ... this is the
  // box, if the box is not showing, bug" (user, 2026-10-15, s028). Before the fix, CommentsModel's
  // `sendSlide` always sent `region: null, marks: []`, ignoring the open draft entirely.
  await page.goto(`${server.base}/${server.token("example-b")}/?slide=s003`, { waitUntil: "load" });
  await radio(/^Rectangle/).click();
  await drag([600, 420], [700, 470]);
  const marksBeforeSend = await count();
  check(marksBeforeSend >= 1, "the rectangle is drawn before sending");
  const tab = page.locator("aside").filter({ has: page.getByPlaceholder("New comment on this slide") });
  await tab.getByPlaceholder("New comment on this slide").fill("I draw a box consider move the legend there");
  await tab.getByRole("button", { name: "Send", exact: true }).first().click();
  const savedFile = await until(() => {
    if (!existsSync(join(deck, "comments"))) return null;
    const files = readdirSync(join(deck, "comments")).filter((f) => f.endsWith(".json"));
    return files.length ? files.sort().pop() : null;
  });
  const saved = JSON.parse(readFileSync(join(deck, "comments", savedFile), "utf8"));
  check(saved.marks.length === 1 && saved.marks[0].tool === "rect", `sending from the tab composer carries the drawn rectangle as the comment's marks: ${JSON.stringify(saved.marks)}`);
  check(!(saved.region?.[0] === 0 && saved.region?.[1] === 0 && saved.region?.[2] === 960 && saved.region?.[3] === 540), `the region is the rectangle's own box, not the whole-slide fallback: ${JSON.stringify(saved.region)}`);
  check((await radio(/^Edit text/).getAttribute("aria-checked")) === "true", "the tool returns to Cursor after sending");
  check((await count()) === 0, "the draft's marks are gone from the slide once the comment is sent");
} finally {
  await browser.close();
  await server.stop();
}

process.exit(failures.length ? 1 : 0);
