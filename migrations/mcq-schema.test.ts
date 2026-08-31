import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * D1 is SQLite, so both migrations are executed here against an in-memory SQLite database
 * to prove the SQL is valid and the constraints actually hold. This does not replace
 * `wrangler d1 migrations apply --local`, which is what proves D1 itself accepts it.
 *
 * `0001` is applied first because the MCQ foreign keys reference `users (id)`.
 */
const MIGRATIONS_DIR = join(process.cwd(), "migrations");

const USERS_SQL = readFileSync(
	join(MIGRATIONS_DIR, "0001_create_users_table.sql"),
	"utf8",
);

function readMcqMigration(): string {
	const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR) : [];
	const match = files.find(
		(file) => file.endsWith(".sql") && file.includes("create_mcq_tables"),
	);

	if (!match) {
		throw new Error(
			`No MCQ migration found in migrations/. Files present: ${
				files.join(", ") || "(none)"
			}`,
		);
	}

	return readFileSync(join(MIGRATIONS_DIR, match), "utf8");
}

type ColumnInfo = {
	name: string;
	type: string;
	notnull: number;
	pk: number;
	dflt_value: string | null;
};

let db: DatabaseSync;

/** `notnull` has to be quoted in a SELECT list, so read the whole pragma row instead. */
function tableInfo(table: string): ColumnInfo[] {
	return db
		.prepare(`SELECT * FROM pragma_table_info('${table}')`)
		.all() as unknown as ColumnInfo[];
}

function insertUser(username = "ada"): string {
	db.prepare(
		`INSERT INTO users (first_name, last_name, username, email, password_hash)
		 VALUES (?, ?, ?, ?, ?)`,
	).run("Ada", "Lovelace", username, `${username}@example.com`, "pbkdf2$fake$hash");

	const row = db
		.prepare("SELECT id FROM users WHERE username = ?")
		.get(username) as { id: string };

	return row.id;
}

function insertQuestion(createdBy: string | null = null): string {
	db.prepare(
		`INSERT INTO mcq_questions (name, question_text, created_by)
		 VALUES (?, ?, ?)`,
	).run("Capital of France", "Which city is the capital of France?", createdBy);

	const row = db
		.prepare("SELECT id FROM mcq_questions ORDER BY rowid DESC LIMIT 1")
		.get() as { id: string };

	return row.id;
}

function insertChoice(
	questionId: string,
	text = "Paris",
	isCorrect = 1,
	position = 0,
): string {
	db.prepare(
		`INSERT INTO mcq_choices (question_id, choice_text, is_correct, position)
		 VALUES (?, ?, ?, ?)`,
	).run(questionId, text, isCorrect, position);

	const row = db
		.prepare("SELECT id FROM mcq_choices ORDER BY rowid DESC LIMIT 1")
		.get() as { id: string };

	return row.id;
}

function insertAttempt(
	questionId: string,
	choiceId: string | null,
	userId: string | null = null,
	isCorrect = 1,
): string {
	db.prepare(
		`INSERT INTO mcq_attempts (question_id, user_id, choice_id, is_correct)
		 VALUES (?, ?, ?, ?)`,
	).run(questionId, userId, choiceId, isCorrect);

	const row = db
		.prepare("SELECT id FROM mcq_attempts ORDER BY rowid DESC LIMIT 1")
		.get() as { id: string };

	return row.id;
}

function count(table: string): number {
	const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
		n: number;
	};

	return row.n;
}

beforeEach(() => {
	db = new DatabaseSync(":memory:");
	// Plain SQLite defaults foreign keys off; D1 has them on. Without this, none of the
	// cascade or set-null assertions below would be testing anything.
	db.exec("PRAGMA foreign_keys = ON");
	db.exec(USERS_SQL);
	db.exec(readMcqMigration());
});

describe("mcq schema, executed against SQLite", () => {
	it("has foreign key enforcement enabled, so the cascade tests are meaningful", () => {
		const row = db.prepare("PRAGMA foreign_keys").get() as {
			foreign_keys: number;
		};

		expect(row.foreign_keys).toBe(1);
	});

	it.each(["mcq_questions", "mcq_choices", "mcq_attempts"])(
		"applies without error and creates the %s table",
		(table) => {
			const row = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
				)
				.get(table);

			expect(row).toEqual({ name: table });
		},
	);

	it("declares exactly the expected mcq_questions columns", () => {
		expect(tableInfo("mcq_questions").map((column) => column.name)).toEqual([
			"id",
			"name",
			"question_text",
			"created_by",
			"created_at",
			"updated_at",
		]);
	});

	it("declares exactly the expected mcq_choices columns", () => {
		expect(tableInfo("mcq_choices").map((column) => column.name)).toEqual([
			"id",
			"question_id",
			"choice_text",
			"is_correct",
			"position",
			"created_at",
		]);
	});

	it("declares exactly the expected mcq_attempts columns", () => {
		expect(tableInfo("mcq_attempts").map((column) => column.name)).toEqual([
			"id",
			"question_id",
			"user_id",
			"choice_id",
			"is_correct",
			"created_at",
		]);
	});

	it.each(["mcq_questions", "mcq_choices", "mcq_attempts"])(
		"makes id the text primary key of %s",
		(table) => {
			const id = tableInfo(table).find((column) => column.name === "id");

			expect(id?.pk).toBe(1);
			expect(id?.type.toUpperCase()).toBe("TEXT");
		},
	);

	it.each([
		["mcq_questions", "name"],
		["mcq_questions", "question_text"],
		["mcq_questions", "created_at"],
		["mcq_questions", "updated_at"],
		["mcq_choices", "question_id"],
		["mcq_choices", "choice_text"],
		["mcq_choices", "is_correct"],
		["mcq_choices", "position"],
		["mcq_choices", "created_at"],
		["mcq_attempts", "question_id"],
		["mcq_attempts", "is_correct"],
		["mcq_attempts", "created_at"],
	])("requires %s.%s to be NOT NULL", (table, column) => {
		expect(tableInfo(table).find((c) => c.name === column)?.notnull).toBe(1);
	});

	/**
	 * These three are nullable on purpose. There is no session management, so nothing can
	 * know who created a question or made an attempt; the columns exist for a later sprint.
	 */
	it.each([
		["mcq_questions", "created_by"],
		["mcq_attempts", "user_id"],
		["mcq_attempts", "choice_id"],
	])("leaves %s.%s nullable, since there is no session yet", (table, column) => {
		expect(tableInfo(table).find((c) => c.name === column)?.notnull).toBe(0);
	});

	it.each([
		"idx_mcq_questions_created_by",
		"idx_mcq_choices_question_id",
		"idx_mcq_attempts_question_id",
		"idx_mcq_attempts_user_id",
		"idx_mcq_attempts_choice_id",
	])("creates the %s index", (indexName) => {
		const index = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
			.get(indexName);

		expect(index).toEqual({ name: indexName });
	});

	it("generates an id and timestamps on a question insert", () => {
		const id = insertQuestion();

		const row = db
			.prepare(
				"SELECT id, created_at, updated_at FROM mcq_questions WHERE id = ?",
			)
			.get(id) as { id: string; created_at: string; updated_at: string };

		expect(row.id).toMatch(/^[0-9a-f]{32}$/);
		expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it("generates ids in the same format for choices and attempts", () => {
		const questionId = insertQuestion();
		const choiceId = insertChoice(questionId);
		const attemptId = insertAttempt(questionId, choiceId);

		expect(choiceId).toMatch(/^[0-9a-f]{32}$/);
		expect(attemptId).toMatch(/^[0-9a-f]{32}$/);
	});

	it("gives each question a distinct id", () => {
		const first = insertQuestion();
		const second = insertQuestion();

		expect(first).not.toBe(second);
	});

	it("defaults is_correct to 0 on a choice", () => {
		const questionId = insertQuestion();
		db.prepare(
			`INSERT INTO mcq_choices (question_id, choice_text, position)
			 VALUES (?, 'Lyon', 1)`,
		).run(questionId);

		const row = db
			.prepare(
				"SELECT is_correct FROM mcq_choices WHERE choice_text = 'Lyon'",
			)
			.get() as { is_correct: number };

		expect(row.is_correct).toBe(0);
	});

	it.each([2, -1, 7])(
		"rejects is_correct = %s on a choice",
		(value) => {
			const questionId = insertQuestion();

			expect(() => insertChoice(questionId, "Nice", value, 1)).toThrow(
				/CHECK constraint failed/,
			);
		},
	);

	it.each([2, -1])("rejects is_correct = %s on an attempt", (value) => {
		const questionId = insertQuestion();
		const choiceId = insertChoice(questionId);

		expect(() => insertAttempt(questionId, choiceId, null, value)).toThrow(
			/CHECK constraint failed/,
		);
	});

	it("rejects a choice whose question does not exist", () => {
		expect(() => insertChoice("does-not-exist")).toThrow(
			/FOREIGN KEY constraint failed/,
		);
	});

	it("rejects an attempt whose question does not exist", () => {
		expect(() => insertAttempt("does-not-exist", null)).toThrow(
			/FOREIGN KEY constraint failed/,
		);
	});

	it("requires a position on every choice", () => {
		const questionId = insertQuestion();

		expect(() =>
			db
				.prepare(
					`INSERT INTO mcq_choices (question_id, choice_text, is_correct)
					 VALUES (?, 'Paris', 1)`,
				)
				.run(questionId),
		).toThrow(/NOT NULL constraint failed: mcq_choices.position/);
	});

	it("deleting a question removes its choices and its attempts", () => {
		const questionId = insertQuestion();
		const choiceId = insertChoice(questionId, "Paris", 1, 0);
		insertChoice(questionId, "Lyon", 0, 1);
		insertAttempt(questionId, choiceId);

		expect(count("mcq_choices")).toBe(2);
		expect(count("mcq_attempts")).toBe(1);

		db.prepare("DELETE FROM mcq_questions WHERE id = ?").run(questionId);

		expect(count("mcq_questions")).toBe(0);
		expect(count("mcq_choices")).toBe(0);
		expect(count("mcq_attempts")).toBe(0);
	});

	it("deleting one question leaves another question's rows alone", () => {
		const kept = insertQuestion();
		const keptChoice = insertChoice(kept, "Paris", 1, 0);
		insertAttempt(kept, keptChoice);

		const removed = insertQuestion();
		const removedChoice = insertChoice(removed, "Berlin", 1, 0);
		insertAttempt(removed, removedChoice);

		db.prepare("DELETE FROM mcq_questions WHERE id = ?").run(removed);

		expect(count("mcq_questions")).toBe(1);
		expect(count("mcq_choices")).toBe(1);
		expect(count("mcq_attempts")).toBe(1);
	});

	it("deleting a user keeps their questions but nulls created_by", () => {
		const userId = insertUser();
		const questionId = insertQuestion(userId);

		db.prepare("DELETE FROM users WHERE id = ?").run(userId);

		const row = db
			.prepare("SELECT created_by FROM mcq_questions WHERE id = ?")
			.get(questionId) as { created_by: string | null };

		expect(count("mcq_questions")).toBe(1);
		expect(row.created_by).toBeNull();
	});

	it("deleting a user keeps their attempts but nulls user_id", () => {
		const userId = insertUser();
		const questionId = insertQuestion();
		const choiceId = insertChoice(questionId);
		const attemptId = insertAttempt(questionId, choiceId, userId);

		db.prepare("DELETE FROM users WHERE id = ?").run(userId);

		const row = db
			.prepare("SELECT user_id FROM mcq_attempts WHERE id = ?")
			.get(attemptId) as { user_id: string | null };

		expect(count("mcq_attempts")).toBe(1);
		expect(row.user_id).toBeNull();
	});

	/**
	 * The reason choice_id is SET NULL rather than CASCADE: replacing a choice during an
	 * edit must not delete the attempt that pointed at it.
	 */
	it("deleting a choice keeps the attempt but nulls choice_id", () => {
		const questionId = insertQuestion();
		const choiceId = insertChoice(questionId);
		const attemptId = insertAttempt(questionId, choiceId, null, 1);

		db.prepare("DELETE FROM mcq_choices WHERE id = ?").run(choiceId);

		const row = db
			.prepare("SELECT choice_id, is_correct FROM mcq_attempts WHERE id = ?")
			.get(attemptId) as { choice_id: string | null; is_correct: number };

		expect(count("mcq_attempts")).toBe(1);
		expect(row.choice_id).toBeNull();
		expect(row.is_correct).toBe(1);
	});

	it("keeps choices readable in position order", () => {
		const questionId = insertQuestion();
		insertChoice(questionId, "Marseille", 0, 2);
		insertChoice(questionId, "Paris", 1, 0);
		insertChoice(questionId, "Lyon", 0, 1);

		const rows = db
			.prepare(
				"SELECT choice_text FROM mcq_choices WHERE question_id = ? ORDER BY position, id",
			)
			.all(questionId) as { choice_text: string }[];

		expect(rows.map((row) => row.choice_text)).toEqual([
			"Paris",
			"Lyon",
			"Marseille",
		]);
	});

	it("does not disturb the users table", () => {
		expect(tableInfo("users").map((column) => column.name)).toEqual([
			"id",
			"first_name",
			"last_name",
			"username",
			"email",
			"password_hash",
			"created_at",
			"updated_at",
		]);
	});
});
