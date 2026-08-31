import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	ChoiceNotInQuestionError,
	createQuestion,
	deleteQuestion,
	findQuestionById,
	listQuestions,
	recordAttempt,
	toPublicQuestion,
	updateQuestion,
} from "./mcq-service";

/**
 * Holder so the hoisted `vi.mock` factory can reach a database built fresh per test.
 * Same injection point as `user-service.test.ts`, but what gets injected is a real SQLite
 * database with the real migrations applied, not a fake that replays queued rows. Every
 * assertion below is therefore about what the database actually did.
 */
const { dbHolder } = vi.hoisted(() => ({
	dbHolder: { current: null as unknown as LocalD1 },
}));

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({ env: { DB: dbHolder.current } })),
}));

type SqliteValue = null | number | bigint | string | Uint8Array;
type Statement = { sql: string; bindings: unknown[] };
type Result = {
	results: unknown[];
	meta: { changes: number; last_row_id: number };
	success: boolean;
};

type LocalD1 = ReturnType<typeof createLocalD1>;

const MIGRATIONS = ["0001_create_users_table.sql", "0002_create_mcq_tables.sql"];

/**
 * Wraps a real in-memory SQLite database in the slice of the D1 API this service uses:
 * `prepare().bind().all()/run()` and `batch()`. `batch()` is a real transaction, so the
 * atomicity tests are testing atomicity rather than a promise that it exists.
 *
 * What this does not reproduce is D1-specific behavior: its error message formats and the
 * exact semantics of its batch. Phase 3's curl checks and Phase 5's preview cover that.
 */
function createLocalD1() {
	const db = new DatabaseSync(":memory:");
	// Plain SQLite defaults foreign keys off; D1 has them on. Without this the cascade and
	// set-null behavior the schema relies on would not happen here.
	db.exec("PRAGMA foreign_keys = ON");
	for (const file of MIGRATIONS) {
		db.exec(readFileSync(join(process.cwd(), "migrations", file), "utf8"));
	}

	const statements: Statement[] = [];

	function execute(record: Statement): Result {
		const prepared = db.prepare(record.sql);
		const bindings = record.bindings as SqliteValue[];

		if (/\breturning\b|^\s*select\b/i.test(record.sql)) {
			const results = prepared.all(...bindings) as unknown[];
			return {
				results,
				meta: { changes: results.length, last_row_id: 0 },
				success: true,
			};
		}

		const info = prepared.run(...bindings);
		return {
			results: [],
			meta: {
				changes: Number(info.changes),
				last_row_id: Number(info.lastInsertRowid),
			},
			success: true,
		};
	}

	function prepare(sql: string) {
		const record: Statement = { sql, bindings: [] };
		statements.push(record);

		const prepared = {
			record,
			bind(...values: unknown[]) {
				record.bindings = values;
				return prepared;
			},
			async all() {
				return execute(record);
			},
			async run() {
				return execute(record);
			},
			first() {
				throw new Error(
					"first() must not be used: d1.mdc requires reading results[0] from all()",
				);
			},
		};

		return prepared;
	}

	return {
		statements,
		prepare,
		async batch(prepared: { record: Statement }[]) {
			db.exec("BEGIN");
			try {
				const results = prepared.map((statement) => execute(statement.record));
				db.exec("COMMIT");
				return results;
			} catch (error) {
				db.exec("ROLLBACK");
				throw error;
			}
		},
		/** Direct read for assertions. Deliberately bypasses `prepare` so the convention
		 * tests only ever see SQL the service itself issued. */
		query<T = Record<string, unknown>>(sql: string, ...bindings: SqliteValue[]): T[] {
			return db.prepare(sql).all(...bindings) as unknown as T[];
		},
		count(table: string): number {
			const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
				n: number;
			};
			return row.n;
		},
		insertUser(username = "ada"): string {
			db.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash)
				 VALUES (?, ?, ?, ?, ?)`,
			).run("Ada", "Lovelace", username, `${username}@example.com`, "pbkdf2$x");

			const row = db
				.prepare("SELECT id FROM users WHERE username = ?")
				.get(username) as { id: string };
			return row.id;
		},
	};
}

const CAPITAL = {
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choices: [
		{ text: "Paris", isCorrect: true },
		{ text: "Lyon", isCorrect: false },
		{ text: "Marseille", isCorrect: false },
	],
};

const LARGEST = {
	name: "Largest planet",
	questionText: "Which is the largest planet in the solar system?",
	choices: [
		{ text: "Jupiter", isCorrect: true },
		{ text: "Earth", isCorrect: false },
	],
};

beforeEach(() => {
	vi.clearAllMocks();
	dbHolder.current = createLocalD1();
});

describe("createQuestion", () => {
	it("returns the question with a generated id, timestamps and its choices", async () => {
		const question = await createQuestion(CAPITAL);

		expect(question.id).toMatch(/^[0-9a-f]{32}$/);
		expect(question.name).toBe("Capital of France");
		expect(question.questionText).toBe(
			"Which city is the capital of France?",
		);
		expect(question.createdAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(question.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(question.choices).toHaveLength(3);
	});

	it("persists the question and its choices to the database", async () => {
		const question = await createQuestion(CAPITAL);

		const rows = dbHolder.current.query<{
			choice_text: string;
			is_correct: number;
			position: number;
		}>(
			"SELECT choice_text, is_correct, position FROM mcq_choices WHERE question_id = ?1 ORDER BY position",
			question.id,
		);

		expect(rows).toEqual([
			{ choice_text: "Paris", is_correct: 1, position: 0 },
			{ choice_text: "Lyon", is_correct: 0, position: 1 },
			{ choice_text: "Marseille", is_correct: 0, position: 2 },
		]);
	});

	it("numbers choice positions from the order they were supplied", async () => {
		const question = await createQuestion(CAPITAL);

		expect(question.choices.map((choice) => choice.position)).toEqual([0, 1, 2]);
		expect(question.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Lyon",
			"Marseille",
		]);
	});

	it("maps is_correct to a boolean rather than leaking the stored integer", async () => {
		const question = await createQuestion(CAPITAL);

		expect(question.choices.map((choice) => choice.isCorrect)).toEqual([
			true,
			false,
			false,
		]);
	});

	it("gives every choice its own generated id", async () => {
		const question = await createQuestion(CAPITAL);
		const ids = question.choices.map((choice) => choice.id);

		for (const id of ids) {
			expect(id).toMatch(/^[0-9a-f]{32}$/);
		}
		expect(new Set(ids).size).toBe(3);
	});

	it("leaves createdBy null, because there is no session to read it from", async () => {
		const question = await createQuestion(CAPITAL);

		expect(question.createdBy).toBeNull();
		const [row] = dbHolder.current.query<{ created_by: string | null }>(
			"SELECT created_by FROM mcq_questions WHERE id = ?1",
			question.id,
		);
		expect(row.created_by).toBeNull();
	});

	it("gives each question a distinct id", async () => {
		const first = await createQuestion(CAPITAL);
		const second = await createQuestion(LARGEST);

		expect(first.id).not.toBe(second.id);
	});

	/**
	 * The reason `db.batch()` is used at all: a question must never reach the database
	 * without its choices. The second choice here violates NOT NULL, so the batch fails
	 * part-way and the question insert has to roll back with it.
	 */
	it("writes nothing at all when one of the choice inserts fails", async () => {
		const broken = {
			name: "Half written",
			questionText: "Does this roll back?",
			choices: [
				{ text: "fine", isCorrect: true },
				{ text: null as unknown as string, isCorrect: false },
			],
		};

		await expect(createQuestion(broken)).rejects.toThrow(
			/NOT NULL constraint failed/,
		);

		expect(dbHolder.current.count("mcq_questions")).toBe(0);
		expect(dbHolder.current.count("mcq_choices")).toBe(0);
	});

	it("writes the question and every choice in a single batch", async () => {
		await createQuestion(CAPITAL);

		const inserts = dbHolder.current.statements.filter((statement) =>
			/^\s*insert/i.test(statement.sql),
		);

		// One question insert plus three choice inserts, and no follow-up read needed.
		expect(inserts).toHaveLength(4);
	});
});

describe("listQuestions", () => {
	it("returns an empty array when there are no questions", async () => {
		await expect(listQuestions()).resolves.toEqual([]);
	});

	it("returns each question with an accurate choice count", async () => {
		await createQuestion(CAPITAL);
		await createQuestion(LARGEST);

		const summaries = await listQuestions();

		expect(summaries).toHaveLength(2);
		expect(
			summaries.map((summary) => [summary.name, summary.choiceCount]),
		).toEqual(
			expect.arrayContaining([
				["Capital of France", 3],
				["Largest planet", 2],
			]),
		);
	});

	it("lists the most recently created question first", async () => {
		await createQuestion(CAPITAL);
		await createQuestion(LARGEST);

		const summaries = await listQuestions();

		expect(summaries.map((summary) => summary.name)).toEqual([
			"Largest planet",
			"Capital of France",
		]);
	});

	it("reports a choice count of 0 rather than dropping a question with no choices", async () => {
		const question = await createQuestion(CAPITAL);
		dbHolder.current.query(
			"DELETE FROM mcq_choices WHERE question_id = ?1",
			question.id,
		);

		const summaries = await listQuestions();

		expect(summaries).toHaveLength(1);
		expect(summaries[0].choiceCount).toBe(0);
	});

	it("does not return the correct answer in a list summary", async () => {
		await createQuestion(CAPITAL);

		const [summary] = await listQuestions();

		expect(summary).not.toHaveProperty("choices");
		expect(JSON.stringify(summary)).not.toContain("isCorrect");
	});
});

describe("findQuestionById", () => {
	it("returns the question with its choices in position order", async () => {
		const created = await createQuestion(CAPITAL);

		const found = await findQuestionById(created.id);

		expect(found?.id).toBe(created.id);
		expect(found?.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Lyon",
			"Marseille",
		]);
	});

	it("returns null when nothing matches", async () => {
		await expect(findQuestionById("missing-id")).resolves.toBeNull();
	});

	it("orders choices by position even when they were stored out of order", async () => {
		const created = await createQuestion(CAPITAL);
		dbHolder.current.query(
			"UPDATE mcq_choices SET position = 9 WHERE choice_text = ?1",
			"Paris",
		);

		const found = await findQuestionById(created.id);

		expect(found?.choices.map((choice) => choice.text)).toEqual([
			"Lyon",
			"Marseille",
			"Paris",
		]);
	});

	it("queries on the bound id rather than an interpolated one", async () => {
		const created = await createQuestion(CAPITAL);
		dbHolder.current.statements.length = 0;

		await findQuestionById(created.id);

		for (const statement of dbHolder.current.statements) {
			expect(statement.sql).not.toContain(created.id);
			expect(statement.bindings).toContain(created.id);
		}
	});
});

describe("updateQuestion", () => {
	it("changes the name and question text", async () => {
		const created = await createQuestion(CAPITAL);

		const updated = await updateQuestion(created.id, {
			name: "Capital city",
			questionText: "What is the capital of France?",
			choices: CAPITAL.choices,
		});

		expect(updated?.name).toBe("Capital city");
		expect(updated?.questionText).toBe("What is the capital of France?");
	});

	it("replaces the choice set and removes the old choices", async () => {
		const created = await createQuestion(CAPITAL);
		const oldChoiceIds = created.choices.map((choice) => choice.id);

		const updated = await updateQuestion(created.id, {
			name: CAPITAL.name,
			questionText: CAPITAL.questionText,
			choices: [
				{ text: "Paris", isCorrect: true },
				{ text: "Nice", isCorrect: false },
			],
		});

		expect(updated?.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Nice",
		]);

		// The old rows are gone, not merely detached from the question.
		const survivors = dbHolder.current.query<{ id: string }>(
			"SELECT id FROM mcq_choices",
		);
		const survivingIds = survivors.map((row) => row.id);
		for (const oldId of oldChoiceIds) {
			expect(survivingIds).not.toContain(oldId);
		}
		expect(dbHolder.current.count("mcq_choices")).toBe(2);
	});

	it("leaves no orphaned choices anywhere in the table after a replace", async () => {
		const kept = await createQuestion(LARGEST);
		const edited = await createQuestion(CAPITAL);

		await updateQuestion(edited.id, {
			name: CAPITAL.name,
			questionText: CAPITAL.questionText,
			choices: [{ text: "Only one now", isCorrect: true }],
		});

		// Every remaining choice must belong to a question that still exists.
		const orphans = dbHolder.current.query(
			`SELECT c.id FROM mcq_choices c
			 LEFT JOIN mcq_questions q ON q.id = c.question_id
			 WHERE q.id IS NULL`,
		);
		expect(orphans).toEqual([]);

		// The other question's choices were not touched.
		expect(
			dbHolder.current.query("SELECT id FROM mcq_choices WHERE question_id = ?1", kept.id),
		).toHaveLength(2);
		expect(dbHolder.current.count("mcq_choices")).toBe(3);
	});

	it("renumbers positions from the new order", async () => {
		const created = await createQuestion(CAPITAL);

		const updated = await updateQuestion(created.id, {
			name: CAPITAL.name,
			questionText: CAPITAL.questionText,
			choices: [
				{ text: "Lyon", isCorrect: false },
				{ text: "Paris", isCorrect: true },
			],
		});

		expect(updated?.choices.map((c) => [c.text, c.position])).toEqual([
			["Lyon", 0],
			["Paris", 1],
		]);
	});

	it("can move which choice is the correct one", async () => {
		const created = await createQuestion(CAPITAL);

		const updated = await updateQuestion(created.id, {
			name: CAPITAL.name,
			questionText: CAPITAL.questionText,
			choices: [
				{ text: "Paris", isCorrect: false },
				{ text: "Lyon", isCorrect: true },
			],
		});

		expect(updated?.choices.map((c) => c.isCorrect)).toEqual([false, true]);
	});

	it("sets updated_at on every update", async () => {
		const created = await createQuestion(CAPITAL);
		dbHolder.current.query(
			"UPDATE mcq_questions SET updated_at = '2020-01-01 00:00:00' WHERE id = ?1",
			created.id,
		);

		const updated = await updateQuestion(created.id, {
			name: "Changed",
			questionText: CAPITAL.questionText,
			choices: CAPITAL.choices,
		});

		expect(updated?.updatedAt).not.toBe("2020-01-01 00:00:00");
	});

	it("returns null when the question does not exist", async () => {
		await expect(
			updateQuestion("missing-id", {
				name: "Nothing",
				questionText: "Nothing",
				choices: CAPITAL.choices,
			}),
		).resolves.toBeNull();
	});

	it("writes nothing when the question does not exist", async () => {
		await updateQuestion("missing-id", {
			name: "Nothing",
			questionText: "Nothing",
			choices: CAPITAL.choices,
		});

		expect(dbHolder.current.count("mcq_questions")).toBe(0);
		expect(dbHolder.current.count("mcq_choices")).toBe(0);
	});

	/**
	 * A failed replace must not destroy the choices it was going to replace. Without one
	 * transaction the delete would already have happened by the time the insert failed.
	 */
	it("keeps the original choices when the replacement fails part-way", async () => {
		const created = await createQuestion(CAPITAL);

		await expect(
			updateQuestion(created.id, {
				name: CAPITAL.name,
				questionText: CAPITAL.questionText,
				choices: [
					{ text: "fine", isCorrect: true },
					{ text: null as unknown as string, isCorrect: false },
				],
			}),
		).rejects.toThrow(/NOT NULL constraint failed/);

		const found = await findQuestionById(created.id);
		expect(found?.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Lyon",
			"Marseille",
		]);
	});

	it("does the update and the choice replacement in a single batch", async () => {
		const created = await createQuestion(CAPITAL);
		dbHolder.current.statements.length = 0;

		await updateQuestion(created.id, {
			name: "Changed",
			questionText: CAPITAL.questionText,
			choices: [{ text: "One", isCorrect: true }],
		});

		const writes = dbHolder.current.statements.filter((statement) =>
			/^\s*(update|delete|insert)/i.test(statement.sql),
		);

		// UPDATE the question, DELETE its old choices, INSERT the one replacement.
		expect(writes).toHaveLength(3);
	});
});

describe("deleteQuestion", () => {
	it("returns true when a row was removed", async () => {
		const created = await createQuestion(CAPITAL);

		await expect(deleteQuestion(created.id)).resolves.toBe(true);
		expect(dbHolder.current.count("mcq_questions")).toBe(0);
	});

	it("returns false when no row matched", async () => {
		await expect(deleteQuestion("missing-id")).resolves.toBe(false);
	});

	it("takes the question's choices and attempts with it", async () => {
		const created = await createQuestion(CAPITAL);
		const correct = created.choices[0];
		await recordAttempt(created.id, correct.id);

		expect(dbHolder.current.count("mcq_choices")).toBe(3);
		expect(dbHolder.current.count("mcq_attempts")).toBe(1);

		await deleteQuestion(created.id);

		expect(dbHolder.current.count("mcq_choices")).toBe(0);
		expect(dbHolder.current.count("mcq_attempts")).toBe(0);
	});

	it("leaves other questions alone", async () => {
		const kept = await createQuestion(LARGEST);
		const removed = await createQuestion(CAPITAL);

		await deleteQuestion(removed.id);

		expect(dbHolder.current.count("mcq_questions")).toBe(1);
		expect(await findQuestionById(kept.id)).not.toBeNull();
		expect(dbHolder.current.count("mcq_choices")).toBe(2);
	});
});

describe("recordAttempt", () => {
	it("records a correct attempt and reports it as correct", async () => {
		const created = await createQuestion(CAPITAL);
		const paris = created.choices[0];

		const result = await recordAttempt(created.id, paris.id);

		expect(result?.attempt.isCorrect).toBe(true);
		expect(result?.attempt.questionId).toBe(created.id);
		expect(result?.attempt.choiceId).toBe(paris.id);
		expect(result?.correctChoiceId).toBe(paris.id);
	});

	it("records an incorrect attempt and still names the correct choice", async () => {
		const created = await createQuestion(CAPITAL);
		const paris = created.choices[0];
		const lyon = created.choices[1];

		const result = await recordAttempt(created.id, lyon.id);

		expect(result?.attempt.isCorrect).toBe(false);
		expect(result?.correctChoiceId).toBe(paris.id);
	});

	it("persists the attempt row", async () => {
		const created = await createQuestion(CAPITAL);
		const lyon = created.choices[1];

		const result = await recordAttempt(created.id, lyon.id);

		const rows = dbHolder.current.query<{
			id: string;
			question_id: string;
			choice_id: string;
			is_correct: number;
			user_id: string | null;
		}>("SELECT id, question_id, choice_id, is_correct, user_id FROM mcq_attempts");

		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(result?.attempt.id);
		expect(rows[0].question_id).toBe(created.id);
		expect(rows[0].choice_id).toBe(lyon.id);
		expect(rows[0].is_correct).toBe(0);
		expect(rows[0].user_id).toBeNull();
	});

	it("leaves userId null, because there is no session to read it from", async () => {
		const created = await createQuestion(CAPITAL);

		const result = await recordAttempt(created.id, created.choices[0].id);

		expect(result?.attempt.userId).toBeNull();
	});

	/**
	 * Correctness has to come from the stored row. If the caller could influence it the
	 * whole feature would be decided in the browser.
	 */
	it("decides correctness from the database, not from anything the caller passes", async () => {
		const created = await createQuestion(CAPITAL);
		const lyon = created.choices[1];

		// Flip the stored answer behind the service's back.
		dbHolder.current.query(
			"UPDATE mcq_choices SET is_correct = 1 WHERE id = ?1",
			lyon.id,
		);
		dbHolder.current.query(
			"UPDATE mcq_choices SET is_correct = 0 WHERE id = ?1",
			created.choices[0].id,
		);

		const result = await recordAttempt(created.id, lyon.id);

		expect(result?.attempt.isCorrect).toBe(true);
		expect(result?.correctChoiceId).toBe(lyon.id);
	});

	it("rejects a choice belonging to another question", async () => {
		const capital = await createQuestion(CAPITAL);
		const largest = await createQuestion(LARGEST);

		await expect(
			recordAttempt(capital.id, largest.choices[0].id),
		).rejects.toThrow(ChoiceNotInQuestionError);
	});

	it("writes no attempt row when the choice belongs to another question", async () => {
		const capital = await createQuestion(CAPITAL);
		const largest = await createQuestion(LARGEST);

		await expect(
			recordAttempt(capital.id, largest.choices[0].id),
		).rejects.toThrow(ChoiceNotInQuestionError);

		expect(dbHolder.current.count("mcq_attempts")).toBe(0);
	});

	it("rejects a choice id that does not exist at all", async () => {
		const created = await createQuestion(CAPITAL);

		await expect(recordAttempt(created.id, "missing-choice")).rejects.toThrow(
			ChoiceNotInQuestionError,
		);
	});

	it("returns null when the question does not exist", async () => {
		await expect(recordAttempt("missing-id", "missing-choice")).resolves.toBeNull();
	});

	it("records every attempt rather than replacing the previous one", async () => {
		const created = await createQuestion(CAPITAL);

		await recordAttempt(created.id, created.choices[0].id);
		await recordAttempt(created.id, created.choices[1].id);
		await recordAttempt(created.id, created.choices[0].id);

		expect(dbHolder.current.count("mcq_attempts")).toBe(3);
	});

	it("can attribute an attempt to a user once one is available", async () => {
		const created = await createQuestion(CAPITAL);
		const userId = dbHolder.current.insertUser();

		const result = await recordAttempt(created.id, created.choices[0].id, userId);

		expect(result?.attempt.userId).toBe(userId);
	});

	/**
	 * Documents the cost of replace-all editing: the attempt survives, but which choice was
	 * picked is no longer recoverable. This is why choice_id is SET NULL and not CASCADE.
	 */
	it("keeps an attempt after its chosen choice is replaced by an edit", async () => {
		const created = await createQuestion(CAPITAL);
		await recordAttempt(created.id, created.choices[0].id);

		await updateQuestion(created.id, {
			name: CAPITAL.name,
			questionText: CAPITAL.questionText,
			choices: [
				{ text: "Paris", isCorrect: true },
				{ text: "Nice", isCorrect: false },
			],
		});

		const rows = dbHolder.current.query<{
			choice_id: string | null;
			is_correct: number;
		}>("SELECT choice_id, is_correct FROM mcq_attempts");

		expect(rows).toHaveLength(1);
		expect(rows[0].choice_id).toBeNull();
		expect(rows[0].is_correct).toBe(1);
	});
});

describe("toPublicQuestion", () => {
	it("removes isCorrect from every choice", async () => {
		const created = await createQuestion(CAPITAL);

		const publicQuestion = toPublicQuestion(created);

		for (const choice of publicQuestion.choices) {
			expect(choice).not.toHaveProperty("isCorrect");
		}
		expect(JSON.stringify(publicQuestion)).not.toContain("isCorrect");
	});

	it("keeps everything else, including the choice ids and order", async () => {
		const created = await createQuestion(CAPITAL);

		const publicQuestion = toPublicQuestion(created);

		expect(publicQuestion.id).toBe(created.id);
		expect(publicQuestion.name).toBe(created.name);
		expect(publicQuestion.questionText).toBe(created.questionText);
		expect(publicQuestion.createdBy).toBeNull();
		expect(publicQuestion.choices.map((choice) => choice.id)).toEqual(
			created.choices.map((choice) => choice.id),
		);
		expect(publicQuestion.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Lyon",
			"Marseille",
		]);
	});
});

describe("d1.mdc conventions", () => {
	async function exerciseEveryStatement() {
		const created = await createQuestion(CAPITAL);
		await listQuestions();
		await findQuestionById(created.id);
		await updateQuestion(created.id, {
			name: "Changed",
			questionText: CAPITAL.questionText,
			choices: [
				{ text: "Paris", isCorrect: true },
				{ text: "Nice", isCorrect: false },
			],
		});
		await recordAttempt(created.id, (await findQuestionById(created.id))!.choices[0].id);
		await deleteQuestion(created.id);
	}

	it("never uses an anonymous placeholder", async () => {
		await exerciseEveryStatement();

		expect(dbHolder.current.statements.length).toBeGreaterThan(0);
		for (const { sql } of dbHolder.current.statements) {
			expect(sql).not.toMatch(/\?(?!\d)/);
		}
	});

	it("numbers placeholders consecutively from ?1 in every statement", async () => {
		await exerciseEveryStatement();

		for (const { sql, bindings } of dbHolder.current.statements) {
			const used = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
			if (used.length === 0) {
				continue;
			}

			const expected = Array.from(
				{ length: Math.max(...used) },
				(_, index) => index + 1,
			);
			expect([...new Set(used)].sort((a, b) => a - b)).toEqual(expected);
			expect(bindings).toHaveLength(Math.max(...used));
		}
	});

	it("never interpolates a value into the SQL text", async () => {
		await exerciseEveryStatement();

		for (const { sql } of dbHolder.current.statements) {
			expect(sql).not.toMatch(/'[^']*'/);
		}
	});

	it("fails loudly if the service ever reaches for first()", async () => {
		// The adapter throws on first(), so this asserts the guard itself is live rather
		// than asserting something about the service that could silently stop being true.
		expect(() => dbHolder.current.prepare("SELECT 1").first()).toThrow(
			/first\(\) must not be used/,
		);
	});
});
