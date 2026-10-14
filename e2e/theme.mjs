// Theme checks (spec/chrome/style.md) against its own copy of decks/example-b: an almost-white page by default,
// Dark that persists, System that follows the scheme, an unthemed slide, and text contrast in both themes.
import { chromium } from "playwright";
import { join } from "node:path";
import { serve } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const editor = `${server.base}/${server.token("example-b")}/`;
const inbox = `${server.base}/inbox`;
const shots = server.root;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));

const readPage = (page) => page.evaluate(() => {
  const rgb = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = (c) => { const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const tokenColor = (name) => { const probe = document.createElement("span"); probe.style.color = `var(--color-${name})`; document.body.append(probe); const c = rgb(getComputedStyle(probe).color); probe.remove(); return c; };
  const body = getComputedStyle(document.body);
  const background = rgb(body.backgroundColor);
  const contrasts = Object.fromEntries(["ink", "ink-muted", "ink-faint"].map((t) => [t, ratio(tokenColor(t), background)]));
  contrasts.body = ratio(rgb(body.color), background);
  const slide = document.querySelector(".folio-slide");
  const slideColors = slide ? [slide, ...slide.querySelectorAll("*")].map((el) => { const s = getComputedStyle(el); return `${s.backgroundColor}|${s.color}`; }).join(";") : null;
  return { theme: document.documentElement.dataset.theme, luminance: lum(background), contrasts, slideColors };
});
const minContrast = (seen) => Math.min(...Object.values(seen.contrasts));
const fmt = (seen) => `theme ${seen.theme}, luminance ${seen.luminance.toFixed(3)}, lowest text contrast ${minContrast(seen).toFixed(2)}`;
const open = async (page, url) => {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForSelector(url === inbox ? 'section[aria-label="Queue"]' : "main .folio-slide");
  await settle(page);
};
const choose = async (page, label) => {
  await page.getByRole("button", { name: "Theme" }).first().click();
  await page.getByRole("menuitemradio", { name: label }).click();
  await page.getByRole("menuitemradio").first().waitFor({ state: "detached" });
  await settle(page);
};

const browser = await chromium.launch();
const light = await browser.newContext({ viewport: { width: 1300, height: 820 }, colorScheme: "dark" });
const page = await light.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await open(page, editor);
const editorLight = await readPage(page);
await page.screenshot({ path: join(shots, "theme-editor-light.png") });
check("cleared storage: the editor page is almost white, even under a dark system", editorLight.theme === "light" && editorLight.luminance >= 0.95, fmt(editorLight));
await open(page, inbox);
const inboxLight = await readPage(page);
await page.screenshot({ path: join(shots, "theme-inbox-light.png") });
check("cleared storage: the inbox page is almost white", inboxLight.luminance >= 0.95, fmt(inboxLight));

await choose(page, "Dark");
const inboxDark = await readPage(page);
await page.screenshot({ path: join(shots, "theme-inbox-dark.png") });
check("Dark from the board's top bar darkens the page", inboxDark.theme === "dark" && inboxDark.luminance < 0.05, fmt(inboxDark));
await open(page, editor);
const editorDark = await readPage(page);
await page.screenshot({ path: join(shots, "theme-editor-dark.png") });
check("Dark persists across a load into the editor", editorDark.theme === "dark" && editorDark.luminance < 0.05, fmt(editorDark));
await page.reload({ waitUntil: "load" });
const reloaded = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem("folio-theme")]);
check("Dark persists across a reload", reloaded[0] === "dark" && reloaded[1] === "dark", reloaded.join(", "));
check("the slide's own colours are the same in Light and Dark", !!editorLight.slideColors && editorLight.slideColors === editorDark.slideColors, `${editorLight.slideColors?.split(";").length ?? 0} slide elements compared`);
check("body text contrast is at least 4.5:1 in both themes", [editorLight, inboxLight, editorDark, inboxDark].every((s) => minContrast(s) >= 4.5), [editorLight, editorDark].map((s) => `${s.theme} ${Object.entries(s.contrasts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" ")}`).join("; "));

await page.waitForSelector("main .folio-slide");
await choose(page, "System");
const systemDark = await readPage(page);
await page.emulateMedia({ colorScheme: "light" });
await page.waitForFunction(() => document.documentElement.dataset.theme === "light", null, { timeout: 5000 }).catch(() => {});
await settle(page);
const systemLight = await readPage(page);
await page.reload({ waitUntil: "load" });
const systemReload = await page.evaluate(() => document.documentElement.dataset.theme);
check("System follows the emulated colour scheme, live and on reload", systemDark.theme === "dark" && systemLight.theme === "light" && systemLight.luminance >= 0.95 && systemReload === "light", `dark scheme ${systemDark.theme}, light scheme ${systemLight.theme}, after reload ${systemReload}`);

await page.evaluate(() => localStorage.setItem("folio-theme", "dark"));
await page.goto(`${editor}?print`, { waitUntil: "load" });
const printed = await page.evaluate(() => document.documentElement.dataset.theme ?? "none");
check("the print page is never themed, even with Dark chosen", printed === "none", `data-theme ${printed}`);

await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
