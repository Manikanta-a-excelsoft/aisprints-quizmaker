import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function mcqMigrationFilename(): string {
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

	return match;
}

function readMcqMigration(): string {
	return readFileSync(join(MIGRATIONS_DIR, mcqMigrationFilename()), "utf8");
}

/**
 * Collapses whitespace so assertions survive reformatting of the SQL, and lowercases
 * so they do not depend on keyword casing.
 */
function normalize(sql: string): string {
	return sql.replace(/\s+/g, " ").toLowerCase();
}

describe("mcq migration", () => {
	it("exists as a .sql file under migrations/", () => {
		expect(() => readMcqMigration()).not.toThrow();
	});

	it("is numbered 0002, following the users migration", () => {
		expect(mcqMigrationFilename()).toMatch(/^0002_/);
	});

	it.each(["mcq_questions", "mcq_choices", "mcq_attempts"])(
		"creates the %s table",
		(table) => {
			expect(normalize(readMcqMigration())).toContain(`create table ${table}`);
		},
	);

	it.each([
		["name", "text not null"],
		["question_text", "text not null"],
		["created_at", "datetime not null"],
		["updated_at", "datetime not null"],
	])("declares mcq_questions.%s as %s", (column, definition) => {
		expect(normalize(readMcqMigration())).toMatch(
			new RegExp(`${column}\\s+${definition}`),
		);
	});

	it.each([
		["choice_text", "text not null"],
		["is_correct", "integer not null"],
		["position", "integer not null"],
	])("declares mcq_choices.%s as %s", (column, definition) => {
		expect(normalize(readMcqMigration())).toMatch(
			new RegExp(`${column}\\s+${definition}`),
		);
	});

	it("gives all three tables the same generated id style as users", () => {
		const sql = normalize(readMcqMigration());
		const ids =
			sql.match(
				/id text primary key default \(lower\(hex\(randomblob\(16\)\)\)\)/g,
			) ?? [];

		expect(ids).toHaveLength(3);
	});

	it("defaults every timestamp column to the current timestamp", () => {
		const sql = normalize(readMcqMigration());
		const defaults = sql.match(/datetime not null default current_timestamp/g) ?? [];

		// created_at and updated_at on questions, created_at on choices and on attempts.
		expect(defaults).toHaveLength(4);
	});

	it.each(["mcq_choices", "mcq_attempts"])(
		"cascades from mcq_questions to %s",
		(table) => {
			const sql = normalize(readMcqMigration());
			const body = sql.slice(sql.indexOf(`create table ${table}`));

			expect(body).toMatch(
				/question_id text not null references mcq_questions\s*\(\s*id\s*\)\s*on delete cascade/,
			);
		},
	);

	it("sets created_by to null rather than cascading when a user is deleted", () => {
		expect(normalize(readMcqMigration())).toMatch(
			/created_by text references users\s*\(\s*id\s*\)\s*on delete set null/,
		);
	});

	it("sets user_id to null rather than cascading when a user is deleted", () => {
		expect(normalize(readMcqMigration())).toMatch(
			/user_id text references users\s*\(\s*id\s*\)\s*on delete set null/,
		);
	});

	/**
	 * Deliberately SET NULL rather than CASCADE: an edit that replaces a choice row must
	 * not silently delete the attempt history pointing at it.
	 */
	it("sets choice_id to null rather than cascading when a choice is deleted", () => {
		expect(normalize(readMcqMigration())).toMatch(
			/choice_id text references mcq_choices\s*\(\s*id\s*\)\s*on delete set null/,
		);
	});

	it("leaves created_by and user_id nullable, since there is no session yet", () => {
		const sql = normalize(readMcqMigration());

		expect(sql).not.toMatch(/created_by text not null/);
		expect(sql).not.toMatch(/user_id text not null/);
	});

	it.each(["mcq_choices", "mcq_attempts"])(
		"constrains %s.is_correct to 0 or 1",
		(table) => {
			const sql = normalize(readMcqMigration());
			const body = sql.slice(sql.indexOf(`create table ${table}`));

			expect(body).toMatch(/check\s*\(\s*is_correct in\s*\(\s*0,\s*1\s*\)\s*\)/);
		},
	);

	it.each([
		["idx_mcq_questions_created_by", "mcq_questions", "created_by"],
		["idx_mcq_choices_question_id", "mcq_choices", "question_id"],
		["idx_mcq_attempts_question_id", "mcq_attempts", "question_id"],
		["idx_mcq_attempts_user_id", "mcq_attempts", "user_id"],
		["idx_mcq_attempts_choice_id", "mcq_attempts", "choice_id"],
	])("creates index %s on %s(%s)", (indexName, table, column) => {
		expect(normalize(readMcqMigration())).toMatch(
			new RegExp(
				`create index ${indexName} on ${table}\\s*\\(\\s*${column}\\s*\\)`,
			),
		);
	});

	it("does not drop or alter the users table", () => {
		const sql = normalize(readMcqMigration());

		expect(sql).not.toContain("drop table");
		expect(sql).not.toContain("alter table users");
	});
});
