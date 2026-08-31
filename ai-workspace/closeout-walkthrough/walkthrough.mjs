/**
 * Close-out walkthrough against the live Workers URL.
 * Creates one question, attempts it, edits it, then deletes it so production
 * is left as it was found.
 */
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "https://aisprints-quizmaker.manikanta-a.workers.dev";
const OUT = "ai-workspace/closeout-walkthrough";
const LOG = `${OUT}/transcript.txt`;
const NAME = "Live close-out check";

mkdirSync(OUT, { recursive: true });
writeFileSync(LOG, "");

let n = 0;
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
		await page.waitForSelector("[data-sonner-toast]", { timeout: 10000 });
		return (await page.locator("[data-sonner-toast]").first().innerText())
			.replace(/\s+/g, " ")
			.trim();
	} catch {
		return "(no toast appeared)";
	}
}

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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await context.newPage();

page.on("pageerror", (err) => say(`    !! page error: ${err.message}`));
page.on("console", (msg) => {
	if (msg.type() === "error") say(`    !! console error: ${msg.text()}`);
});

try {
	say(`Live URL: ${BASE}`);

	say("\n=== 1. Empty bank on production ===");
	await page.goto(`${BASE}/mcq`);
	await page.getByRole("heading", { level: 1 }).waitFor();
	say(`URL: ${page.url()}`);
	say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
	const empty = (await page.getByText("No questions yet").count()) > 0;
	say(`Empty-state card shown? ${empty}`);
	await shot("empty-bank");

	say("\n=== 2. Create a question with three choices ===");
	await page.getByRole("link", { name: /question/i }).first().click();
	await page.waitForURL("**/mcq/new");
	say(`URL: ${page.url()}`);
	await page.getByRole("textbox", { name: "Name" }).fill(NAME);
	await page
		.getByRole("textbox", { name: "Question text" })
		.fill("Which gas do plants take in during photosynthesis?");
	await page.getByRole("textbox", { name: "Choice 1" }).fill("Carbon dioxide");
	await page.getByRole("textbox", { name: "Choice 2" }).fill("Oxygen");
	await page.getByRole("button", { name: "Add choice" }).click();
	await page.getByRole("textbox", { name: "Choice 3" }).fill("Nitrogen");
	await page.getByRole("radio", { name: "Mark choice 1 as correct" }).click();
	await shot("create-form");
	await waitForNoToasts();
	await page.getByRole("button", { name: "Create question" }).click();
	say(`Toast: "${await toastText()}"`);
	await page.waitForURL(/\/mcq$/);
	await nameCell(NAME).waitFor();
	say(`Row: ${await rowSummary(NAME)}`);
	say(`URL: ${page.url()}`);
	await shot("list-after-create");

	say("\n=== 3. Attempt it — wrong, then correct ===");
	await page.getByRole("button", { name: `Actions for ${NAME}` }).click();
	await page.getByRole("menuitem", { name: "Preview" }).click();
	await page.waitForURL("**/attempt");
	say(`URL: ${page.url()}`);
	await page.getByRole("heading", { level: 1 }).waitFor();
	await page.getByRole("radio", { name: "Oxygen" }).click();
	await page.getByRole("button", { name: "Submit answer" }).click();
	await page.getByRole("status").waitFor();
	say(`Wrong: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
	await shot("attempt-wrong");

	await page.getByRole("button", { name: "Try again" }).click();
	await page.getByRole("radio", { name: "Carbon dioxide" }).click();
	await page.getByRole("button", { name: "Submit answer" }).click();
	await page.getByRole("status").waitFor();
	say(`Right: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
	await shot("attempt-right");

	const questionId = page.url().split("/mcq/")[1].split("/")[0];
	say(`Question id: ${questionId}`);

	say("\n=== 4. Edit — move the correct mark ===");
	await page.goto(`${BASE}/mcq/${questionId}/edit`);
	await page.getByRole("heading", { level: 1 }).waitFor();
	say(`URL: ${page.url()}`);
	say(`Name seeded: "${await page.getByRole("textbox", { name: "Name" }).inputValue()}"`);
	await page.getByRole("radio", { name: "Mark choice 3 as correct" }).click();
	await waitForNoToasts();
	await page.getByRole("button", { name: "Save changes" }).click();
	say(`Toast: "${await toastText()}"`);
	await page.waitForURL(/\/mcq$/);
	say(`Back on: ${page.url()}`);
	await shot("list-after-edit");

	say("\n=== 5. Delete through the confirmation dialog ===");
	await page.getByRole("button", { name: `Actions for ${NAME}` }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("alertdialog").waitFor();
	say(`Dialog: "${await page.getByRole("alertdialog").locator('[data-slot="alert-dialog-title"]').innerText()}"`);
	await shot("delete-dialog");
	await waitForNoToasts();
	await page.getByRole("button", { name: "Delete question" }).click();
	say(`Toast: "${await toastText()}"`);
	await page.waitForTimeout(600);
	say(`Row gone? ${(await nameCell(NAME).count()) === 0}`);
	say(`Empty-state card back? ${(await page.getByText("No questions yet").count()) > 0}`);
	say(`URL: ${page.url()}`);
	await shot("list-after-delete");

	const after = await (await fetch(`${BASE}/api/mcq`)).json();
	say(`GET /api/mcq after delete: ${JSON.stringify(after)}`);
	say(`GET /api/mcq/${questionId}: ${(await fetch(`${BASE}/api/mcq/${questionId}`)).status}`);

	say("\n=== close-out walkthrough finished cleanly ===");
} catch (err) {
	say(`\n!! WALKTHROUGH FAILED: ${err.message}`);
	await shot("failure");
	process.exitCode = 1;
} finally {
	await browser.close();
}
