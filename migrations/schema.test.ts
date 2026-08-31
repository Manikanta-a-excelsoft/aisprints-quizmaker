import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * D1 is SQLite, so the migration is executed here against an in-memory SQLite database
 * to prove the SQL is valid and the constraints actually hold. This does not replace
 * `wrangler d1 migrations apply --local`, which is what proves D1 itself accepts it.
 */
const MIGRATION_SQL = readFileSync(
	join(process.cwd(), "migrations", "0001_create_users_table.sql"),
	"utf8",
);

type ColumnInfo = {
	name: string;
	type: string;
	notnull: number;
	pk: number;
	dflt_value: string | null;
};

let db: DatabaseSync;

/** `notnull` has to be quoted in a SELECT list, so read the whole pragma row instead. */
function tableInfo(): ColumnInfo[] {
	return db
		.prepare("SELECT * FROM pragma_table_info('users')")
		.all() as unknown as ColumnInfo[];
}

function insertUser(overrides: Partial<Record<string, string>> = {}) {
	const user = {
		first_name: "Ada",
		last_name: "Lovelace",
		username: "ada",
		email: "ada@example.com",
		password_hash: "pbkdf2$fake$hash",
		...overrides,
	};

	db.prepare(
		`INSERT INTO users (first_name, last_name, username, email, password_hash)
		 VALUES (?, ?, ?, ?, ?)`,
	).run(
		user.first_name,
		user.last_name,
		user.username,
		user.email,
		user.password_hash,
	);

	return user;
}

beforeEach(() => {
	db = new DatabaseSync(":memory:");
	db.exec(MIGRATION_SQL);
});

describe("users schema, executed against SQLite", () => {
	it("applies without error and creates the users table", () => {
		const table = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
			.get();

		expect(table).toEqual({ name: "users" });
	});

	it("declares exactly the expected columns", () => {
		expect(tableInfo().map((column) => column.name)).toEqual([
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

	it("makes id the primary key", () => {
		const id = tableInfo().find((column) => column.name === "id");

		expect(id?.pk).toBe(1);
		expect(id?.type.toUpperCase()).toBe("TEXT");
	});

	it.each([
		"first_name",
		"last_name",
		"username",
		"email",
		"password_hash",
		"created_at",
		"updated_at",
	])("requires %s to be NOT NULL", (columnName) => {
		expect(tableInfo().find((column) => column.name === columnName)?.notnull).toBe(1);
	});

	it.each(["idx_users_username", "idx_users_email"])(
		"creates the %s index",
		(indexName) => {
			const index = db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
				.get(indexName);

			expect(index).toEqual({ name: indexName });
		},
	);

	it("generates an id and timestamps on insert", () => {
		insertUser();

		const row = db
			.prepare("SELECT id, created_at, updated_at FROM users WHERE username = 'ada'")
			.get() as { id: string; created_at: string; updated_at: string };

		expect(row.id).toMatch(/^[0-9a-f]{32}$/);
		expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	});

	it("gives each user a distinct id", () => {
		insertUser();
		insertUser({ username: "grace", email: "grace@example.com" });

		const ids = db.prepare("SELECT id FROM users").all() as { id: string }[];

		expect(new Set(ids.map((row) => row.id)).size).toBe(2);
	});

	it("rejects a duplicate username", () => {
		insertUser();

		expect(() => insertUser({ email: "different@example.com" })).toThrow(
			/UNIQUE constraint failed: users.username/,
		);
	});

	it("rejects a duplicate email", () => {
		insertUser();

		expect(() => insertUser({ username: "different" })).toThrow(
			/UNIQUE constraint failed: users.email/,
		);
	});

	it("rejects a user with no password hash", () => {
		expect(() =>
			db
				.prepare(
					`INSERT INTO users (first_name, last_name, username, email)
					 VALUES ('Ada', 'Lovelace', 'ada', 'ada@example.com')`,
				)
				.run(),
		).toThrow(/NOT NULL constraint failed: users.password_hash/);
	});
});
