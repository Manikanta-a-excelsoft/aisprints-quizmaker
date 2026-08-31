import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function readUsersMigration(): string {
	const files = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR) : [];
	const match = files.find(
		(file) => file.endsWith(".sql") && file.includes("create_users_table"),
	);

	if (!match) {
		throw new Error(
			`No users migration found in migrations/. Files present: ${
				files.join(", ") || "(none)"
			}`,
		);
	}

	return readFileSync(join(MIGRATIONS_DIR, match), "utf8");
}

/**
 * Collapses whitespace so assertions survive reformatting of the SQL, and lowercases
 * so they do not depend on keyword casing.
 */
function normalize(sql: string): string {
	return sql.replace(/\s+/g, " ").toLowerCase();
}

describe("users migration", () => {
	it("exists as a .sql file under migrations/", () => {
		expect(() => readUsersMigration()).not.toThrow();
	});

	it("creates the users table", () => {
		expect(normalize(readUsersMigration())).toContain("create table users");
	});

	it.each([
		["id", "text primary key"],
		["first_name", "text not null"],
		["last_name", "text not null"],
		["username", "text not null"],
		["email", "text not null"],
		["password_hash", "text not null"],
		["created_at", "datetime not null"],
		["updated_at", "datetime not null"],
	])("declares %s as %s", (column, definition) => {
		const sql = normalize(readUsersMigration());
		expect(sql).toMatch(new RegExp(`${column}\\s+${definition}`));
	});

	it.each(["username", "email"])("makes %s unique", (column) => {
		const sql = normalize(readUsersMigration());
		expect(sql).toMatch(new RegExp(`${column}\\s+text not null unique`));
	});

	it.each([
		["idx_users_username", "username"],
		["idx_users_email", "email"],
	])("creates index %s on users(%s)", (indexName, column) => {
		const sql = normalize(readUsersMigration());
		expect(sql).toMatch(
			new RegExp(`create index ${indexName} on users\\s*\\(\\s*${column}\\s*\\)`),
		);
	});

	it("stores a password hash rather than a plaintext password column", () => {
		const sql = normalize(readUsersMigration());
		expect(sql).toContain("password_hash");
		expect(sql).not.toMatch(/[(,]\s*password\s+text/);
	});

	it("defaults created_at and updated_at to the current timestamp", () => {
		const sql = normalize(readUsersMigration());
		const defaults = sql.match(/default current_timestamp/g) ?? [];
		expect(defaults).toHaveLength(2);
	});
});
