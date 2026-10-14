/** Waits on what a page shows, in place of fixed sleeps. */

/** Resolve once no CSS transition or animation is running and two frames have painted. */
export async function settle(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { polling: "raf", timeout: 5000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Resolve once the body's text includes a string; false after the timeout. */
export const shows = (page, text, timeout = 5000) => page.waitForFunction((s) => document.body.innerText.includes(s), text, { timeout }).then(() => true, () => false);

/**
 * Resolve once the element exists, the page has settled, and the element's box and its scroll container's offsets
 * hold for three frames. The element is awaited first: a page that has not rendered it yet holds "still" too.
 */
export async function still(page, selector = "main .folio-slide") {
  await page.waitForSelector(selector, { state: "attached", timeout: 15000 });
  await settle(page);
  await page.evaluate((sel) => new Promise((resolve, reject) => {
    const read = () => {
      const el = document.querySelector(sel);
      const box = el?.getBoundingClientRect();
      const main = el?.closest("main");
      return JSON.stringify([box?.x, box?.y, box?.width, box?.height, main?.scrollLeft, main?.scrollTop]);
    };
    const end = performance.now() + 5000;
    let last = read();
    let same = 0;
    const tick = () => {
      const now = read();
      same = now === last ? same + 1 : 0;
      last = now;
      if (same >= 3) resolve();
      else if (performance.now() > end) reject(new Error(`${sel} never held still`));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), selector);
}

/** A download's bytes, read through Playwright's stream: `download.path()` throws on a shared (connected) browser. */
export async function downloadBytes(download) {
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
}
