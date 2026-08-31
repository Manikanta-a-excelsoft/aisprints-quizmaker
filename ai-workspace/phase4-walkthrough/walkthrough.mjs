import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const OUT = "ai-workspace/phase4-walkthrough";
const LOG = `${OUT}/transcript.txt`;

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
	return file;
}

/**
 * Toasts live for about four seconds, so an earlier one can still be on screen when the
 * next action fires. Clearing first is what makes the next reading unambiguous.
 */
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await context.newPage();

page.on("pageerror", (err) => say(`    !! page error: ${err.message}`));
page.on("console", (msg) => {
	if (msg.type() === "error") say(`    !! console error: ${msg.text()}`);
});

try {
	// ---------------------------------------------------------------- skeletons
	say("\n=== 1. Skeleton rows while the list loads ===");
	say(`URL: ${BASE}/mcq`);
	let alreadyDelayed = false;
	const slowList = async (route) => {
		if (!alreadyDelayed) {
			alreadyDelayed = true;
			await new Promise((r) => setTimeout(r, 2500));
		}
		try {
			await route.continue();
		} catch {
			// The route can outlive the navigation that asked for it.
		}
	};
	await page.route("**/api/mcq", slowList);
	await page.goto(`${BASE}/mcq`);
	await page.waitForSelector('[data-slot="skeleton"]');
	const skeletons = await page.locator('[data-slot="skeleton"]').count();
	say(`Saw: ${skeletons} skeleton elements in the table while the fetch was in flight.`);
	say(`Search box present yet? ${await page.getByRole("textbox", { name: "Search questions" }).count()} (hidden until loaded)`);
	await shot("list-loading-skeletons");
	await page.unroute("**/api/mcq", slowList);

	// ---------------------------------------------------------------- list
	say("\n=== 2. The list, loaded ===");
	await page.goto(`${BASE}/mcq`);
	await nameCell("Capital of France").waitFor();
	say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
	const names = await page.locator('[data-testid="question-name"]').allInnerTexts();
	say(`Rows: ${names.join(", ")}`);
	say(`Row "Capital of France" reads: ${await rowSummary("Capital of France")}`);
	await shot("list-loaded");

	// ---------------------------------------------------------------- search
	say("\n=== 3. Search filters the rows already in memory ===");
	let requests = 0;
	page.on("request", (req) => {
		if (req.url().endsWith("/api/mcq")) requests += 1;
	});
	await page.getByRole("textbox", { name: "Search questions" }).fill("planet");
	await page.waitForTimeout(300);
	say(`Typed "planet". Rows now: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
	say(`Extra GET /api/mcq requests caused by typing: ${requests}`);
	await shot("search-filtered");

	say('Typed "zzz" (matches nothing):');
	await page.getByRole("textbox", { name: "Search questions" }).fill("zzz");
	await page.waitForTimeout(300);
	say(`  Message shown: "${await page.locator("tbody").innerText()}"`);
	say(`  Empty-bank card shown instead? ${(await page.getByText("No questions yet").count()) > 0}`);
	await shot("search-no-matches");
	await page.getByRole("textbox", { name: "Search questions" }).fill("");

	// ---------------------------------------------------------------- create, invalid
	say("\n=== 4. Create page, submitting an invalid form ===");
	await page.getByRole("link", { name: "New question" }).click();
	await page.waitForURL("**/mcq/new");
	say(`URL is now: ${page.url()}`);
	say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
	say(`Choice inputs on a fresh form: ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()}`);
	say(`"Remove choice 1" disabled at two choices? ${await page.getByRole("button", { name: "Remove choice 1" }).isDisabled()}`);
	await shot("create-empty-form");

	say('Clicked "Create question" with everything blank:');
	await page.getByRole("button", { name: "Create question" }).click();
	await page.waitForTimeout(400);
	const errs = await page.locator('[data-slot="field-error"]').allInnerTexts();
	say(`  Inline errors: ${errs.map((e) => `"${e.trim()}"`).join(", ")}`);
	say(`  Still on the create page? ${page.url().endsWith("/mcq/new")}`);
	await shot("create-validation-errors");

	// ---------------------------------------------------------------- choice limits
	say("\n=== 5. The dynamic choice list, at its limits ===");
	await page.getByRole("textbox", { name: "Name" }).fill("Ocean depth");
	await page.getByRole("textbox", { name: "Question text" }).fill("Which is the deepest ocean trench?");
	await page.getByRole("textbox", { name: "Choice 1" }).fill("Mariana Trench");
	await page.getByRole("textbox", { name: "Choice 2" }).fill("Puerto Rico Trench");
	for (let i = 0; i < 4; i += 1) {
		await page.getByRole("button", { name: "Add choice" }).click();
	}
	say(`Clicked "Add choice" four times. Choices now: ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()}`);
	say(`"Add choice" disabled? ${await page.getByRole("button", { name: "Add choice" }).isDisabled()}`);
	say(`Copy beside it: "${await page.getByText("A question can have at most six choices").innerText()}"`);
	await shot("create-six-choices");

	for (let i = 6; i > 3; i -= 1) {
		await page.getByRole("button", { name: `Remove choice ${i}` }).click();
	}
	await page.getByRole("textbox", { name: "Choice 3" }).fill("Tonga Trench");
	say(`Removed three, filled choice 3. Choices now: ${await page.getByRole("textbox", { name: /^Choice \d$/ }).count()}`);

	say("Submitted with no choice marked correct:");
	await page.getByRole("button", { name: "Create question" }).click();
	await page.waitForTimeout(400);
	say(`  Error: "${(await page.locator('[data-slot="field-error"]').allInnerTexts()).map((e) => e.trim()).join(" / ")}"`);
	await shot("create-no-correct-marked");

	// ---------------------------------------------------------------- create, valid
	say("\n=== 6. Creating the question ===");
	await page.getByRole("radio", { name: "Mark choice 1 as correct" }).click();
	await waitForNoToasts();
	await page.getByRole("button", { name: "Create question" }).click();
	const createToast = await toastText();
	say(`  Toast said: "${createToast}"`);
	await shot("create-toast");
	await page.waitForURL("**/mcq");
	say(`  URL is now: ${page.url()}`);
	await nameCell("Ocean depth").waitFor();
	say(`  New row reads: ${await rowSummary("Ocean depth")}`);
	await shot("list-after-create");

	// ---------------------------------------------------------------- row actions
	say("\n=== 7. Row actions in the dropdown ===");
	await page.getByRole("button", { name: "Actions for Ocean depth" }).click();
	await page.getByRole("menuitem", { name: "Preview" }).waitFor();
	const items = await page.getByRole("menuitem").allInnerTexts();
	say(`Clicked the row's actions trigger. Menu items: ${items.map((i) => i.trim()).join(", ")}`);
	say(`  Preview href: ${await page.getByRole("menuitem", { name: "Preview" }).getAttribute("href")}`);
	say(`  Edit href:    ${await page.getByRole("menuitem", { name: "Edit" }).getAttribute("href")}`);
	await shot("row-actions-open");

	// ---------------------------------------------------------------- edit
	say("\n=== 8. Editing, reusing the same form ===");
	await page.getByRole("menuitem", { name: "Edit" }).click();
	await page.waitForURL("**/edit");
	say(`URL is now: ${page.url()}`);
	await page.getByRole("heading", { level: 1 }).waitFor();
	say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
	say(`Name field seeded with: "${await page.getByRole("textbox", { name: "Name" }).inputValue()}"`);
	const seeded = [];
	for (let i = 1; i <= 3; i += 1) {
		seeded.push(await page.getByRole("textbox", { name: `Choice ${i}` }).inputValue());
	}
	say(`Choices seeded: ${seeded.join(", ")}`);
	say(`Choice 1 pre-marked correct? ${await page.getByRole("radio", { name: "Mark choice 1 as correct" }).isChecked()}`);
	say(`Submit button reads: "${await page.getByRole("button", { name: "Save changes" }).innerText()}"`);
	await shot("edit-seeded");

	await page.getByRole("textbox", { name: "Name" }).fill("Deepest ocean trench");
	await waitForNoToasts();
	await page.getByRole("button", { name: "Save changes" }).click();
	const updateToast = await toastText();
	say(`  Toast said: "${updateToast}"`);
	await shot("edit-toast");
	await page.waitForURL(/\/mcq$/);
	await nameCell("Deepest ocean trench").waitFor();
	say(`  Row now reads: ${await rowSummary("Deepest ocean trench")}`);
	await shot("list-after-edit");

	// ---------------------------------------------------------------- attempt, wrong
	say("\n=== 9. Attempting the question and getting it wrong ===");
	await page.getByRole("button", { name: "Actions for Deepest ocean trench" }).click();
	await page.getByRole("menuitem", { name: "Preview" }).click();
	await page.waitForURL("**/attempt");
	say(`URL is now: ${page.url()}`);
	await page.getByRole("heading", { level: 1 }).waitFor();
	say(`Heading: "${await page.getByRole("heading", { level: 1 }).innerText()}"`);
	const radios = await page.getByRole("radio").evaluateAll((els) =>
		els.map((el) => el.getAttribute("aria-label")),
	);
	say(`Choices offered, in order: ${radios.join(", ")}`);
	say(`Submit disabled before a choice is picked? ${await page.getByRole("button", { name: "Submit answer" }).isDisabled()}`);
	say(`Any answer revealed yet? ${(await page.getByText("Correct answer").count()) > 0}`);
	await shot("attempt-unanswered");

	await page.getByRole("radio", { name: "Tonga Trench" }).click();
	say('Picked "Tonga Trench" (the wrong one) and clicked "Submit answer".');
	await page.getByRole("button", { name: "Submit answer" }).click();
	await page.getByRole("status").waitFor();
	say(`  Result banner: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
	say(`  "Correct answer" badge sits beside: "${await page.locator('[data-testid^="choice-"]', { has: page.getByText("Correct answer") }).innerText()}"`);
	say(`  Submit button still present? ${(await page.getByRole("button", { name: "Submit answer" }).count()) > 0}`);
	say(`  "Try again" offered? ${(await page.getByRole("button", { name: "Try again" }).count()) > 0}`);
	await shot("attempt-incorrect");

	// ---------------------------------------------------------------- attempt, right
	say("\n=== 10. Trying again and getting it right ===");
	await page.getByRole("button", { name: "Try again" }).click();
	await page.waitForTimeout(200);
	say(`Clicked "Try again". Result banner gone? ${(await page.getByRole("status").count()) === 0}`);
	say(`  Submit disabled again? ${await page.getByRole("button", { name: "Submit answer" }).isDisabled()}`);
	await page.getByRole("radio", { name: "Mariana Trench" }).click();
	await page.getByRole("button", { name: "Submit answer" }).click();
	await page.getByRole("status").waitFor();
	say(`Picked "Mariana Trench". Result banner: "${(await page.getByRole("status").innerText()).replace(/\s+/g, " ")}"`);
	await shot("attempt-correct");

	// ---------------------------------------------------------------- delete
	say("\n=== 11. Deleting, with the confirmation step ===");
	await page.getByRole("link", { name: "Back to questions" }).click();
	await page.waitForURL(/\/mcq$/);
	await nameCell("Deepest ocean trench").waitFor();
	await page.getByRole("button", { name: "Actions for Deepest ocean trench" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("alertdialog").waitFor();
	say(`Chose Delete. A dialog appeared rather than the row vanishing.`);
	say(`  Dialog title: "${await page.getByRole("alertdialog").locator('[data-slot="alert-dialog-title"]').innerText()}"`);
	say(`  Dialog body:  "${(await page.getByRole("alertdialog").locator('[data-slot="alert-dialog-description"]').innerText()).replace(/\s+/g, " ")}"`);
	say(`  Buttons: ${(await page.getByRole("alertdialog").getByRole("button").allInnerTexts()).map((b) => `"${b.trim()}"`).join(", ")}`);
	await shot("delete-confirm-dialog");

	say('Clicked "Cancel" first:');
	await page.getByRole("button", { name: "Cancel" }).click();
	await page.waitForTimeout(400);
	say(`  Row still there? ${(await nameCell("Deepest ocean trench").count()) > 0}`);

	say('Reopened the dialog and clicked "Delete question":');
	await waitForNoToasts();
	await page.getByRole("button", { name: "Actions for Deepest ocean trench" }).click();
	await page.getByRole("menuitem", { name: "Delete" }).click();
	await page.getByRole("alertdialog").waitFor();
	await page.getByRole("button", { name: "Delete question" }).click();

	const deleteToast = await toastText();
	say(`  Toast said: "${deleteToast}"`);
	await shot("delete-toast");
	await page.waitForTimeout(600);
	say(`  Row gone without a reload? ${(await nameCell("Deepest ocean trench").count()) === 0}`);
	say(`  Rows remaining: ${(await page.locator('[data-testid="question-name"]').allInnerTexts()).join(", ")}`);
	await shot("list-after-delete");

	// ---------------------------------------------------------------- not found
	say("\n=== 12. A question id that does not exist ===");
	await page.goto(`${BASE}/mcq/nope-not-a-real-id/attempt`);
	await page.getByText("Question not found").waitFor();
	say(`URL: ${page.url()}`);
	say(`Shown: "${await page.locator('[data-slot="card"]').innerText()}"`.replace(/\s+/g, " "));
	await shot("attempt-not-found");

	// ---------------------------------------------------------------- empty state
	say("\n=== 13. The empty state, with every question deleted ===");
	const list = await (await fetch(`${BASE}/api/mcq`)).json();
	for (const q of list.questions) {
		await fetch(`${BASE}/api/mcq/${q.id}`, { method: "DELETE" });
	}
	await page.goto(`${BASE}/mcq`);
	await page.getByText("No questions yet").waitFor();
	say(`Deleted the remaining ${list.questions.length} question(s), then reloaded ${BASE}/mcq`);
	say(`Card reads: "${(await page.locator('[data-slot="card"]').innerText()).replace(/\s+/g, " ")}"`);
	say(`  Table rendered at all? ${(await page.locator("table").count()) > 0}`);
	say(`  Search box shown? ${(await page.getByRole("textbox", { name: "Search questions" }).count()) > 0}`);
	say(`  Button href: ${await page.getByRole("link", { name: "Create your first question" }).getAttribute("href")}`);
	await shot("empty-state");

	say("\n=== walkthrough finished cleanly ===");
} catch (err) {
	say(`\n!! WALKTHROUGH FAILED: ${err.message}`);
	await shot("failure");
	process.exitCode = 1;
} finally {
	await browser.close();
}
