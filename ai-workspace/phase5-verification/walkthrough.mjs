/**
 * Phase 5 walkthrough, driven against `npm run preview` — the OpenNext worker on workerd,
 * not `next dev`. Split into two stages so the local D1 file can be read in between:
 * miniflare holds the sqlite file while the worker is up, so the attempts have to be
 * inspected at a point where the browser is idle.
 *
 *   node ai-workspace/phase5-verification/walkthrough.mjs main
 *   node ai-workspace/phase5-verification/walkthrough.mjs delete
 */
import { mkdirSync, appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const STAGE = process.argv[2] ?? "main";
const BASE = "http://127.0.0.1:8787";
const OUT = "ai-workspace/phase5-verification";
const LOG = `${OUT}/transcript-${STAGE}.txt`;
const STATE = `${OUT}/state.json`;

const NAME = "Photosynthesis inputs";
const RENAMED = "Photosynthesis inputs";
const LIMITS_NAME = "L".repeat(100);

mkdirSync(OUT, { recursive: true });
writeFileSync(LOG, "");

let n = STAGE === "delete" ? 30 : 0;
let page;

function say(line) {
	appendFileSync(LOG, `${line}\n`);
	console.log(line);
}

async function shot(label) {
	n += 1;
	const file = `${String(n).padStart(2, "0")}-${label}.png`;
	await page.screenshot({ path: `${OUT}/${file}` });
	say(`    [screenshot ${file}]`);
}

/** Toasts live ~4s, so an older one can still be on screen when the next action fires. */
async function waitForNoToasts() {
	await page
		.waitForFunction(
			() => document.querySelectorAll("[data-sonner-toast]").length === 0,
			null,
			{ timeout: 10000 },
		)
		.catch(() => {});
}

async function toastText() {
	try {
		await page.waitForSelector("[data-sonner-toast]", { timeout: 8000 });
		return (await page.locator("[data-sonner-toast]").first().innerText())
			.replace(/\s+/g, " ")
			.trim();
	} catch {
		return "(no toast appeared)";
	}
}

/** The name cell specifically — plain text search also hits the question-text column. */
function nameCell(name) {
	return page.locator('[data-testid="question-name"]', { hasText: name });
}

async function rowSummary(name) {
	const row = page.locator("tr", { hasText: name }).first();
	if ((await row.count()) === 0) return "(no row)";
	const cells = await row.locator("td").allInnerTexts();
	return cells
		.slice(0, 3)
		.map((c) => c.replace(/\s+/g, " ").trim())
		.join(" | ");
}

async function inlineErrors() {
	const errs = await page.locator('[data-slot="field-error"]').allInnerTexts();
	return errs.map((e) => `"${e.replace(/\s+/g, " ").trim()}"`).join(", ") || "(none)";
}

async function fillForm({ name, text, choices }) {
	await page.getByRole("textbox", { name: "Name" }).fill(name);
	await page.getByRole("textbox", { name: "Question text" }).fill(text);
	const have = await page.getByRole("textbox", { name: /^Choice \d$/ }).count();
	for (let i = have; i < choices.length; i += 1) {
		await page.getByRole("button", { name: "Add choice" }).click();
	}
	for (let i = 0; i < choices.length; i += 1) {
		await page.getByRole("textbox", { name: `Choice ${i + 1}` }).fill(choices[i]);
	}
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await context.newPage();

page.on("pageerror", (err) => say(`    !! page error: ${err.message}`));
page.on("console", (msg) => {
	if (msg.type() === "error") say(`    !! console error: ${msg.text()}`);
});

try {
	if (STAGE === "main") {
		// Only the names this run uses, so the Phase 4 leftovers stay as background rows.
		const existing = await (await fetch(`${BASE}/api/mcq`)).json();
		for (const q of existing.questions) {
			if (q.name === NAME || q.name === RENAMED || q.name === LIMITS_NAME) {
				await fetch(`${BASE}/api/mcq/${q.id}`, { method: "DELETE" });
			}
		}

		// ------------------------------------------------------------ the list, on workerd
		say("\n=== 1. The list page, served by the worker ===");
		say(`URL: ${BASE}/mcq`);
		await page.goto(`${BASE}/mcq`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
		await page.locator('[data-testid="question-name"]').first().waitFor();
		say(
			`Rows already in the bank: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`,
		);
		say(`Server header: ${(await (await fetch(`${BASE}/mcq`)).headers.get("server")) ?? "(none)"}`);
		await shot("list-on-worker");

		// ------------------------------------------------------------ edge: empty form
		say("\n=== 2. Edge case: submitting a completely empty form ===");
		await page.getByRole("link", { name: "New question" }).click();
		await page.waitForURL("**/mcq/new");
		say(`URL: ${page.url()}`);
		say(`Choice rows on a fresh form: ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()}`);
		say('Clicked "Create question" with every field blank.');
		await page.getByRole("button", { name: "Create question" }).click();
		await page.waitForTimeout(400);
		say(`  Inline errors: ${await inlineErrors()}`);
		say(`  Still on the create page? ${page.url().endsWith("/mcq/new")}`);
		say(`  Any toast raised? ${(await page.locator("[data-sonner-toast]").count()) > 0}`);
		await shot("empty-form-errors");

		// ------------------------------------------------------------ edge: six choices
		say("\n=== 3. Edge case: the maximum of six choices ===");
		for (let i = 0; i < 4; i += 1) {
			await page.getByRole("button", { name: "Add choice" }).click();
			say(
				`  Click ${i + 1} on "Add choice" → ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()} choices, button disabled? ${await page.getByRole("button", { name: "Add choice" }).isDisabled()}`,
			);
		}
		say(`  Choice rows now: ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()}`);
		say(`  "Add choice" disabled? ${await page.getByRole("button", { name: "Add choice" }).isDisabled()}`);
		say(`  Copy beside it: "${await page.getByText("A question can have at most six choices").innerText()}"`);
		say(`  "Remove choice 6" enabled? ${!(await page.getByRole("button", { name: "Remove choice 6" }).isDisabled())}`);
		await shot("six-choices-capped");

		for (let i = 6; i > 2; i -= 1) {
			await page.getByRole("button", { name: `Remove choice ${i}` }).click();
		}
		say(`  Removed back down to ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()} choices.`);
		say(`  "Remove choice 1" disabled at the floor of two? ${await page.getByRole("button", { name: "Remove choice 1" }).isDisabled()}`);

		// ------------------------------------------------------------ edge: over the limits
		say("\n=== 4. Edge case: one character over every limit ===");
		await fillForm({
			name: "N".repeat(101),
			text: "Q".repeat(1001),
			choices: ["C".repeat(501), "short"],
		});
		await page.getByRole("radio", { name: "Mark choice 1 as correct" }).click();
		say("Name 101 chars, question text 1001 chars, choice 1 501 chars. Submitted.");
		await page.getByRole("button", { name: "Create question" }).click();
		await page.waitForTimeout(400);
		say(`  Inline errors: ${await inlineErrors()}`);
		say(`  Still on the create page? ${page.url().endsWith("/mcq/new")}`);
		await shot("over-character-limits");

		say("\n=== 5. Edge case: exactly on every limit ===");
		await fillForm({
			name: LIMITS_NAME,
			text: "Q".repeat(1000),
			choices: ["C".repeat(500), "short"],
		});
		say("Trimmed each field to exactly 100 / 1000 / 500 characters. Submitted.");
		await waitForNoToasts();
		await page.getByRole("button", { name: "Create question" }).click();
		say(`  Toast said: "${await toastText()}"`);
		await page.waitForURL(/\/mcq$/);
		say(`  Accepted, and the URL is now: ${page.url()}`);
		await nameCell(LIMITS_NAME.slice(0, 20)).waitFor();
		say(`  Row reads: ${(await rowSummary(LIMITS_NAME.slice(0, 20))).slice(0, 160)}…`);
		await shot("at-character-limits-accepted");

		const created = await (await fetch(`${BASE}/api/mcq`)).json();
		const boundary = created.questions.find((q) => q.name === LIMITS_NAME);
		say(`  Stored name length: ${boundary.name.length}, question text length: ${boundary.questionText.length}`);
		await fetch(`${BASE}/api/mcq/${boundary.id}`, { method: "DELETE" });
		say(`  Removed the boundary question again so it does not clutter the run.`);

		// ------------------------------------------------------------ create, three choices
		say("\n=== 6. Creating a question with three choices ===");
		await page.goto(`${BASE}/mcq/new`);
		await fillForm({
			name: NAME,
			text: "Which two raw materials does a plant take in for photosynthesis?",
			choices: [
				"Carbon dioxide and water",
				"Oxygen and glucose",
				"Nitrogen and sunlight",
			],
		});
		say(`URL: ${page.url()}`);
		say(`Name: "${NAME}"`);
		say(`Question text: "${await page.getByRole("textbox", { name: "Question text" }).inputValue()}"`);
		for (let i = 1; i <= 3; i += 1) {
			say(`  Choice ${i}: "${await page.getByRole("textbox", { name: `Choice ${i}` }).inputValue()}"`);
		}
		await page.getByRole("radio", { name: "Mark choice 1 as correct" }).click();
		say('Marked choice 1 ("Carbon dioxide and water") as the correct answer.');
		await shot("create-three-choices");

		await waitForNoToasts();
		await page.getByRole("button", { name: "Create question" }).click();
		say(`  Toast said: "${await toastText()}"`);
		await shot("create-toast");

		// ------------------------------------------------------------ shows in the list
		say("\n=== 7. Confirming it shows up in the list ===");
		await page.waitForURL(/\/mcq$/);
		say(`Redirected to: ${page.url()}`);
		await nameCell(NAME).waitFor();
		say(`Row reads: ${await rowSummary(NAME)}`);
		say(`All rows: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
		await shot("list-after-create");

		// ------------------------------------------------------------ search
		say("\n=== 8. Searching for it ===");
		let listRequests = 0;
		page.on("request", (req) => {
			if (req.url().endsWith("/api/mcq")) listRequests += 1;
		});
		await page.getByRole("textbox", { name: "Search questions" }).fill("photosynth");
		await page.waitForTimeout(400);
		say('Typed "photosynth" into the search box.');
		say(`  Rows now: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
		say(`  Extra GET /api/mcq requests caused by typing: ${listRequests}`);
		say(`  URL unchanged, no query param? ${page.url()}`);
		await shot("search-filtered");

		// ------------------------------------------------------------ open it
		say("\n=== 9. Opening it ===");
		await page.getByRole("button", { name: `Actions for ${NAME}` }).click();
		await page.getByRole("menuitem", { name: "Preview" }).waitFor();
		say(`Opened the row's actions menu. Items: ${(await page.getByRole("menuitem").allInnerTexts()).map((i) => i.trim()).join(", ")}`);
		await page.getByRole("menuitem", { name: "Preview" }).click();
		await page.waitForURL("**/attempt");
		await page.getByRole("heading", { level: 1 }).waitFor();
		const questionId = page.url().split("/mcq/")[1].split("/")[0];
		say(`URL: ${page.url()}`);
		say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
		say(`Prompt: "${await page.locator('[data-slot="card-description"]').innerText()}"`);
		const radios = await page
			.getByRole("radio")
			.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
		say(`Choices offered, in position order: ${radios.join(" / ")}`);
		say(`Submit disabled before anything is picked? ${await page.getByRole("button", { name: "Submit answer" }).isDisabled()}`);
		say(`Correct answer revealed already? ${(await page.getByText("Correct answer").count()) > 0}`);
		await shot("attempt-unanswered");

		// ------------------------------------------------------------ wrong answer
		say("\n=== 10. Attempting it with the wrong answer ===");
		await page.getByRole("radio", { name: "Oxygen and glucose" }).click();
		say('Picked "Oxygen and glucose" and clicked "Submit answer".');
		await page.getByRole("button", { name: "Submit answer" }).click();
		await page.getByRole("status").waitFor();
		say(`  Result banner: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
		say(`  "Correct answer" badge sits beside: "${(await page.locator('[data-testid^="choice-"]', { has: page.getByText("Correct answer") }).innerText()).replace(/\s+/g, " ")}"`);
		say(`  Radios locked after answering? ${await page.getByRole("radio", { name: "Nitrogen and sunlight" }).isDisabled()}`);
		say(`  "Try again" offered instead of Submit? ${(await page.getByRole("button", { name: "Try again" }).count()) > 0}`);
		await shot("attempt-incorrect");

		// ------------------------------------------------------------ right answer
		say("\n=== 11. Trying again with the correct answer ===");
		await page.getByRole("button", { name: "Try again" }).click();
		await page.waitForTimeout(300);
		say('Clicked "Try again".');
		say(`  Result banner cleared? ${(await page.getByRole("status").count()) === 0}`);
		say(`  Nothing pre-selected, submit disabled again? ${await page.getByRole("button", { name: "Submit answer" }).isDisabled()}`);
		await page.getByRole("radio", { name: "Carbon dioxide and water" }).click();
		say('Picked "Carbon dioxide and water" and clicked "Submit answer".');
		await page.getByRole("button", { name: "Submit answer" }).click();
		await page.getByRole("status").waitFor();
		say(`  Result banner: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
		await shot("attempt-correct");

		// ------------------------------------------------------------ edit
		say("\n=== 12. Editing it and changing which choice is correct ===");
		await page.goto(`${BASE}/mcq/${questionId}/edit`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		say(`URL: ${page.url()}`);
		say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
		say(`Name seeded with: "${await page.getByRole("textbox", { name: "Name" }).inputValue()}"`);
		for (let i = 1; i <= 3; i += 1) {
			say(
				`  Choice ${i}: "${await page.getByRole("textbox", { name: `Choice ${i}` }).inputValue()}" — marked correct? ${await page.getByRole("radio", { name: `Mark choice ${i} as correct` }).isChecked()}`,
			);
		}
		await shot("edit-seeded");

		await page.getByRole("radio", { name: "Mark choice 3 as correct" }).click();
		say('Moved the correct mark from choice 1 to choice 3 ("Nitrogen and sunlight").');
		say(`  Choice 1 now unmarked? ${!(await page.getByRole("radio", { name: "Mark choice 1 as correct" }).isChecked())}`);
		await waitForNoToasts();
		await page.getByRole("button", { name: "Save changes" }).click();
		say(`  Toast said: "${await toastText()}"`);
		await shot("edit-toast");
		await page.waitForURL(/\/mcq$/);
		say(`  Back on: ${page.url()}`);

		say("Reopened the attempt page to confirm the new correct choice took effect:");
		await page.goto(`${BASE}/mcq/${questionId}/attempt`);
		await page.getByRole("heading", { level: 1 }).waitFor();
		await page.getByRole("radio", { name: "Carbon dioxide and water" }).click();
		await page.getByRole("button", { name: "Submit answer" }).click();
		await page.getByRole("status").waitFor();
		say(`  Submitted the old correct choice. Banner: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
		await shot("attempt-after-edit");

		writeFileSync(STATE, JSON.stringify({ questionId, name: RENAMED }, null, "\t"));
		say(`\nQuestion id for the D1 check: ${questionId}`);
		say("\n=== stage 'main' finished cleanly ===");
	}

	if (STAGE === "delete") {
		const { questionId, name } = JSON.parse(readFileSync(STATE, "utf8"));

		say("\n=== 14. Deleting it through the confirmation dialog ===");
		await page.goto(`${BASE}/mcq`);
		await nameCell(name).waitFor();
		say(`URL: ${page.url()}`);
		say(`Rows before: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
		await page.getByRole("button", { name: `Actions for ${name}` }).click();
		await page.getByRole("menuitem", { name: "Delete" }).click();
		await page.getByRole("alertdialog").waitFor();
		say("Chose Delete. A confirmation dialog appeared rather than the row vanishing.");
		say(`  Title: "${await page.getByRole("alertdialog").locator('[data-slot="alert-dialog-title"]').innerText()}"`);
		say(`  Body:  "${(await page.getByRole("alertdialog").locator('[data-slot="alert-dialog-description"]').innerText()).replace(/\s+/g, " ")}"`);
		say(`  Buttons: ${(await page.getByRole("alertdialog").getByRole("button").allInnerTexts()).map((b) => `"${b.trim()}"`).join(", ")}`);
		await shot("delete-confirm-dialog");

		say('Clicked "Cancel" first, to prove the dialog is a real gate:');
		await page.getByRole("button", { name: "Cancel" }).click();
		await page.waitForTimeout(400);
		say(`  Row still present? ${(await nameCell(name).count()) > 0}`);
		say(`  Question still readable over the API? ${(await fetch(`${BASE}/api/mcq/${questionId}`)).status === 200}`);

		say('Reopened the dialog and clicked "Delete question":');
		await waitForNoToasts();
		await page.getByRole("button", { name: `Actions for ${name}` }).click();
		await page.getByRole("menuitem", { name: "Delete" }).click();
		await page.getByRole("alertdialog").waitFor();
		await page.getByRole("button", { name: "Delete question" }).click();
		say(`  Toast said: "${await toastText()}"`);
		await shot("delete-toast");

		await page.waitForTimeout(800);
		say(`  Row gone without a page reload? ${(await nameCell(name).count()) === 0}`);
		say(`  Rows remaining: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
		await shot("list-after-delete");

		await page.reload();
		await page.locator('[data-testid="question-name"]').first().waitFor();
		say(`  After a hard reload, rows are: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
		say(`  GET /api/mcq/${questionId} now returns: ${(await fetch(`${BASE}/api/mcq/${questionId}`)).status}`);
		await shot("list-after-reload");

		say("\n=== 15. Edge case: a bogus id in the UI ===");
		await page.goto(`${BASE}/mcq/not-a-real-id/attempt`);
		await page.getByText("Question not found").waitFor();
		say(`URL: ${page.url()}`);
		say(`Card reads: "${(await page.locator('[data-slot="card"]').innerText()).replace(/\s+/g, " ")}"`);
		await shot("bogus-id-attempt");

		await page.goto(`${BASE}/mcq/not-a-real-id/edit`);
		await page.getByText("Question not found").waitFor();
		say(`URL: ${page.url()}`);
		say(`Card reads: "${(await page.locator('[data-slot="card"]').innerText()).replace(/\s+/g, " ")}"`);
		await shot("bogus-id-edit");

		say("\n=== stage 'delete' finished cleanly ===");
	}
} catch (err) {
	say(`\n!! WALKTHROUGH FAILED: ${err.message}`);
	await shot("failure");
	process.exitCode = 1;
} finally {
	await browser.close();
}
