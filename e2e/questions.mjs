// Questionnaires inside comment conversations (spec/comments/questions.md) against an isolated copy of decks/example:
// an agent asks through the CLI into the user's comment and through the API into a new conversation; the editor has
// no Questions tab and the board no Questions column; the form renders inline in the comment's thread in the editor
// (all four kinds) and in the board's chat panel; Submit waits for the required answers; `folio answers` (and
// `--wait`, started before the submit) returns them and the thread gains no message.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve, until } from "./lib/server.mjs";

const server = await serve({ decks: ["example"] });
const { base, cli, root } = server;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const token = server.token("example");
const post = (path, body, worker) => fetch(`${base}/${path}`, { method: "POST", headers: worker ? { "x-folio-worker": worker } : {}, body: JSON.stringify(body) }).then((r) => r.json());
const get = (path) => fetch(`${base}/${path}`).then((r) => r.json());
const questionnaire = {
  title: "Which framing for the results slide?",
  intro: "Two framings fit the data; only you know the audience.",
  slide: "s002",
  questions: [
    { id: "framing", prompt: "Lead with", kind: "single", options: ["Mechanism", "Numbers"], other: true, required: true },
    { id: "keep", prompt: "Keep which panels", kind: "multi", options: ["a", "b", "c"], min: 1, max: 2, required: true },
    { id: "label", prompt: "Axis label", kind: "text", placeholder: "e.g. Energy / eV" },
    { id: "notes", prompt: "Anything else", kind: "long" },
  ],
};

const refused = (() => {
  try {
    cli(["ask", "decks/example", "--worker", "w1"], JSON.stringify({ title: "x", questions: [{ id: "a", prompt: "p", kind: "single", options: ["A"] }] }));
    return "";
  } catch (error) {
    return String(error.stderr);
  }
})();
check("a bad questionnaire is refused with the field and the fix", /questions\[0\]\.options: a single question needs at least two options/.test(refused), refused.trim());

const asked = await post(`${token}/comments`, { slide: "s002", region: [25, 110, 440, 100], marks: [], text: "Not sure how to frame this slide." });
const file = join(root, "q.json");
writeFileSync(file, JSON.stringify(questionnaire));
const id = cli(["ask", "decks/example", "--comment", asked.id, "--file", file, "--worker", "w1"]).trim();
const thread = await get(`${token}/comments/${asked.id}`);
check("folio ask --comment prints the id and adds one message to that thread", /^q[0-9a-z]+$/.test(id) && thread.thread.length === 2 && thread.thread[1].question?.id === id && thread.thread[1].author === "w1", `${id}, ${thread.thread.length} messages`);
const viaApi = await post(`${token}/questions`, { title: "Is fig:a final?", questions: [{ id: "final", prompt: "Final?", kind: "single", options: ["Yes", "No"] }] }, "w2");
const started = await get(`${token}/comments/${viaApi.comment}`);
check("the API without a comment starts a conversation by the asker", viaApi.status === "open" && started.thread[0].author === "w2" && started.assignee === "w2" && started.thread[0].question?.id === viaApi.id, `${viaApi.id} in ${viaApi.comment} on ${started.slide}`);
const inbox = await get(`api/inbox?view=all&scope=${token}`);
const unreadOf = (cid) => inbox.rows.find((r) => r.id === cid)?.unread;
check("each questionnaire counts as an unread agent reply", unreadOf(asked.id) === 1 && unreadOf(viaApi.comment) === 1 && !inbox.rows.some((r) => r.view === "questions"), `unread ${unreadOf(asked.id)}, ${unreadOf(viaApi.comment)}`);
const open = JSON.parse(cli(["answers", "decks/example", id]));
check("folio answers prints null answers while open, and names the comment", open.status === "open" && open.answers === null && open.comment === asked.id, JSON.stringify(open).slice(0, 80));

const waiting = server.cliAsync(["answers", "decks/example", id, "--wait", "--timeout", "60"]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));

await page.goto(`${base}/${token}/?question=${id}`, { waitUntil: "load" });
const card = page.locator(`li[data-comment="${asked.id}"]`);
const form = card.locator(`form[aria-label="${questionnaire.title}"]`);
await form.waitFor({ timeout: 5000 }).catch(() => {});
check("?question= opens its comment, with the address naming the comment", page.url().includes(`comment=${asked.id}`) && !page.url().includes("question=") && (await card.getAttribute("aria-current")) === "true", page.url());
const kinds = await form.locator("fieldset[data-kind]").evaluateAll((els) => els.map((e) => e.dataset.kind));
check("the form renders inline in the thread with all four kinds", JSON.stringify(kinds) === JSON.stringify(["single", "multi", "text", "long"]), kinds.join(","));
check("the editor has no Questions tab", (await page.getByRole("tab", { name: "Questions" }).count()) === 0, `${await page.getByRole("tab").allInnerTexts()}`);
check("the rail marks the asked slide", (await page.locator('[data-rail-slide="s002"] [data-asked]').count()) === 1, "s002 marked");
const formBox = await form.boundingBox();
const cardBox = await card.boundingBox();
check("the form fits inside the card's width", formBox && cardBox && formBox.x >= cardBox.x && formBox.x + formBox.width <= cardBox.x + cardBox.width + 0.5, `form ${formBox?.width.toFixed(0)} px in card ${cardBox?.width.toFixed(0)} px`);

const submit = form.getByRole("button", { name: "Submit" });
const disabledAtFirst = await submit.isDisabled();
const note = await form.locator("[data-missing]").innerText().catch(() => "");
await form.getByRole("radio", { name: "Numbers" }).click();
const stillDisabled = await submit.isDisabled();
await form.getByRole("checkbox", { name: "a" }).click();
await form.getByLabel("Axis label").fill("Energy / eV");
check("Submit stays disabled until every required answer is in, and the card stays open", disabledAtFirst && stillDisabled && !(await submit.isDisabled()) && (await card.getAttribute("aria-current")) === "true", `note "${note}"`);

await page.reload({ waitUntil: "load" });
await form.waitFor();
const kept = await form.getByLabel("Axis label").inputValue();
check("a draft survives leaving and coming back", kept === "Energy / eV" && (await form.getByRole("radio", { name: "Numbers" }).getAttribute("aria-checked")) === "true", `kept "${kept}"`);

await form.getByRole("button", { name: "Submit" }).click();
const waited = await Promise.race([waiting, new Promise((r) => setTimeout(() => r(null), 15000))]);
const got = waited ? JSON.parse(waited) : null;
check("folio answers --wait resolves on submit", got?.status === "answered" && got.answers.values.framing === "Numbers", JSON.stringify(got?.answers?.values ?? null));
const now = JSON.parse(cli(["answers", id]));
check("folio answers returns the answers", JSON.stringify(now.answers.values) === JSON.stringify({ framing: "Numbers", keep: ["a"], label: "Energy / eV" }) && now.answers.by === "user", JSON.stringify(now.answers.values));
const answeredThread = await get(`${token}/comments/${asked.id}`);
check("answering adds no message; the turn is the agent's again", answeredThread.thread.length === 2 && answeredThread.thread[1].question.status === "answered" && (await card.getByRole("button", { name: "Edit answers" }).count()) === 1, `${answeredThread.thread.length} messages, ${answeredThread.thread[1].question.status}`);

await card.getByRole("button", { name: "Edit answers" }).click();
await card.getByRole("radio", { name: "Mechanism" }).click();
await card.getByRole("button", { name: "Submit changes" }).click();
const round2 = await until(() => JSON.parse(cli(["answers", id])).answers?.round === 2, 5000);
check("Edit answers sends round 2", !!round2, `round 2 ${!!round2}`);

await page.goto(`${base}/inbox?from=${token}`, { waitUntil: "load" });
const columns = await page.locator("main section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
await page.getByRole("button", { name: "Board settings" }).click();
const settingQuestions = await page.getByText("Show Questions column").count();
await page.keyboard.press("Escape");
check("the board has no Questions column or setting", !columns.includes("Questions") && settingQuestions === 0, columns.join(", "));
await page.locator(`li[data-card="${viaApi.comment}"] a`).first().click();
const panel = page.locator('aside[aria-label="Comment chat"]');
const panelForm = panel.locator('form[aria-label="Is fig:a final?"]');
const inPanel = await panelForm.waitFor({ timeout: 5000 }).then(() => true, () => false);
const [panelBox, panelFormBox] = [await panel.boundingBox(), inPanel ? await panelForm.boundingBox() : null];
check("the board's chat panel draws the form inline, within its width", inPanel && panelFormBox.x >= panelBox.x && panelFormBox.x + panelFormBox.width <= panelBox.x + panelBox.width, `panel ${panelBox?.width.toFixed(0)} px, form ${panelFormBox?.width.toFixed(0)} px`);
await panelForm.getByRole("radio", { name: "Yes" }).click();
await panelForm.getByRole("button", { name: "Submit" }).click();
const panelAnswered = await until(async () => (await get(`${token}/questions/${viaApi.id}`)).status === "answered", 5000);
check("submitting in the board panel answers it", !!panelAnswered && (await panel.getByRole("button", { name: "Edit answers" }).waitFor({ timeout: 3000 }).then(() => true, () => false)), `${viaApi.id} answered ${!!panelAnswered}`);

const third = cli(["ask", "decks/example", "--worker", "w3"], JSON.stringify({ title: "Keep slide 1?", slide: "s001", questions: [{ id: "k", prompt: "Keep?", kind: "single", options: ["Yes", "No"] }] })).trim();
cli(["ask", "--withdraw", third, "--worker", "w3"]);
await page.goto(`${base}/${token}/?question=${third}`, { waitUntil: "load" });
check("a withdrawn questionnaire shows as withdrawn in its thread", await page.locator("li[data-comment]").getByText("Withdrawn by w3").waitFor({ timeout: 5000 }).then(() => true, () => false), third);

await browser.close();
await server.stop();
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
