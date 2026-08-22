import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	DuplicateUserError,
	createUser,
	deleteUser,
	findUserByEmail,
	findUserById,
	findUserByUsername,
	toPublicUser,
	updateUser,
} from "./user-service";

/**
 * Holder so the hoisted `vi.mock` factory can reach a database built fresh per test.
 */
const { dbHolder } = vi.hoisted(() => ({
	dbHolder: { current: null as unknown as MockDb },
}));

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({ env: { DB: dbHolder.current } })),
}));

type Statement = { sql: string; bindings: unknown[] };
type Queued =
	| { kind: "rows"; rows: unknown[] }
	| { kind: "run"; changes: number }
	| { kind: "error"; error: Error };

type MockDb = ReturnType<typeof createMockDb>;

function createMockDb() {
	const statements: Statement[] = [];
	const queue: Queued[] = [];

	function respond() {
		const next = queue.shift();

		if (!next) {
			// An unqueued query behaves like a query that matched nothing.
			return { results: [], meta: { changes: 0 }, success: true };
		}

		if (next.kind === "error") {
			throw next.error;
		}

		if (next.kind === "run") {
			return { results: [], meta: { changes: next.changes }, success: true };
		}

		return { results: next.rows, meta: { changes: next.rows.length }, success: true };
	}

	return {
		statements,
		queueRows(rows: unknown[]) {
			queue.push({ kind: "rows", rows });
		},
		queueRun(changes: number) {
			queue.push({ kind: "run", changes });
		},
		queueError(error: Error) {
			queue.push({ kind: "error", error });
		},
		lastStatement() {
			return statements[statements.length - 1];
		},
		prepare(sql: string) {
			const statement: Statement = { sql, bindings: [] };
			statements.push(statement);

			const prepared = {
				bind(...values: unknown[]) {
					statement.bindings = values;
					return prepared;
				},
				async all() {
					return respond();
				},
				async run() {
					return respond();
				},
				first() {
					throw new Error(
						"first() must not be used: d1.mdc requires reading results[0] from all()",
					);
				},
			};

			return prepared;
		},
	};
}

const ROW = {
	id: "0f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
	first_name: "Ada",
	last_name: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	password_hash: "pbkdf2$120000$salt$derived",
	created_at: "2026-08-22 10:00:00",
	updated_at: "2026-08-22 10:00:00",
};

const USER = {
	id: "0f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	passwordHash: "pbkdf2$120000$salt$derived",
	createdAt: "2026-08-22 10:00:00",
	updatedAt: "2026-08-22 10:00:00",
};

const NEW_USER_INPUT = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	passwordHash: "pbkdf2$120000$salt$derived",
};

function uniqueConstraintError(column: string) {
	return new Error(
		`D1_ERROR: UNIQUE constraint failed: users.${column}: SQLITE_CONSTRAINT`,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	dbHolder.current = createMockDb();
});

describe("createUser", () => {
	it("returns the created user with generated id and timestamps", async () => {
		dbHolder.current.queueRows([ROW]);

		await expect(createUser(NEW_USER_INPUT)).resolves.toEqual(USER);
	});

	it("binds the supplied values in the order the statement declares them", async () => {
		dbHolder.current.queueRows([ROW]);

		await createUser(NEW_USER_INPUT);

		expect(dbHolder.current.lastStatement().bindings).toEqual([
			"Ada",
			"Lovelace",
			"ada",
			"ada@example.com",
			"pbkdf2$120000$salt$derived",
		]);
	});

	it("stores the hash it was given and never a plaintext password", async () => {
		dbHolder.current.queueRows([ROW]);

		await createUser(NEW_USER_INPUT);

		const { sql, bindings } = dbHolder.current.lastStatement();
		expect(sql).toContain("password_hash");
		expect(sql).not.toMatch(/\bpassword\b(?!_hash)/);
		expect(bindings).toContain("pbkdf2$120000$salt$derived");
	});

	it("reports a duplicate username as a DuplicateUserError naming the field", async () => {
		dbHolder.current.queueError(uniqueConstraintError("username"));

		await expect(createUser(NEW_USER_INPUT)).rejects.toThrow(DuplicateUserError);
		dbHolder.current.queueError(uniqueConstraintError("username"));
		await expect(createUser(NEW_USER_INPUT)).rejects.toMatchObject({
			field: "username",
		});
	});

	it("reports a duplicate email as a DuplicateUserError naming the field", async () => {
		dbHolder.current.queueError(uniqueConstraintError("email"));

		await expect(createUser(NEW_USER_INPUT)).rejects.toMatchObject({
			field: "email",
		});
	});

	it("lets an unrelated database error surface unchanged", async () => {
		dbHolder.current.queueError(new Error("D1_ERROR: database is locked"));

		await expect(createUser(NEW_USER_INPUT)).rejects.toThrow(/database is locked/);
		await expect(createUser(NEW_USER_INPUT)).rejects.not.toBeInstanceOf(
			DuplicateUserError,
		);
	});

	it("throws when the insert returns no row", async () => {
		dbHolder.current.queueRows([]);

		await expect(createUser(NEW_USER_INPUT)).rejects.toThrow(/could not be created/i);
	});
});

describe.each([
	["findUserById", findUserById, "id", USER.id],
	["findUserByUsername", findUserByUsername, "username", "ada"],
	["findUserByEmail", findUserByEmail, "email", "ada@example.com"],
] as const)("%s", (_name, find, column, argument) => {
	it("returns the mapped user when a row matches", async () => {
		dbHolder.current.queueRows([ROW]);

		await expect(find(argument)).resolves.toEqual(USER);
	});

	it("returns null when nothing matches", async () => {
		dbHolder.current.queueRows([]);

		await expect(find(argument)).resolves.toBeNull();
	});

	it(`queries on ${column} with a bound parameter`, async () => {
		dbHolder.current.queueRows([ROW]);

		await find(argument);

		const statement = dbHolder.current.lastStatement();
		expect(statement.sql).toMatch(new RegExp(`where ${column} = \\?1`, "i"));
		expect(statement.bindings).toEqual([argument]);
	});
});

describe("updateUser", () => {
	it("returns the updated user", async () => {
		const updated = { ...ROW, first_name: "Augusta", updated_at: "2026-08-22 11:00:00" };
		dbHolder.current.queueRows([updated]);

		await expect(updateUser(USER.id, { firstName: "Augusta" })).resolves.toEqual({
			...USER,
			firstName: "Augusta",
			updatedAt: "2026-08-22 11:00:00",
		});
	});

	it("sets updated_at on every update", async () => {
		dbHolder.current.queueRows([ROW]);

		await updateUser(USER.id, { firstName: "Augusta" });

		expect(dbHolder.current.lastStatement().sql.toLowerCase()).toContain(
			"updated_at = current_timestamp",
		);
	});

	it("only writes the columns it was asked to change", async () => {
		dbHolder.current.queueRows([ROW]);

		await updateUser(USER.id, { email: "augusta@example.com" });

		const { sql, bindings } = dbHolder.current.lastStatement();
		const lower = sql.toLowerCase();
		const setClause = sql.slice(lower.indexOf(" set "), lower.indexOf(" where "));

		expect(setClause).toContain("email = ?1");
		expect(setClause).not.toContain("first_name");
		expect(setClause).not.toContain("username");
		expect(bindings).toEqual(["augusta@example.com", USER.id]);
	});

	it("can update the password hash", async () => {
		dbHolder.current.queueRows([{ ...ROW, password_hash: "pbkdf2$new" }]);

		const result = await updateUser(USER.id, { passwordHash: "pbkdf2$new" });

		expect(dbHolder.current.lastStatement().sql).toContain("password_hash = ?1");
		expect(result?.passwordHash).toBe("pbkdf2$new");
	});

	it("returns null when the user does not exist", async () => {
		dbHolder.current.queueRows([]);

		await expect(updateUser("missing-id", { firstName: "Augusta" })).resolves.toBeNull();
	});

	it("rejects an update with no fields rather than building invalid SQL", async () => {
		await expect(updateUser(USER.id, {})).rejects.toThrow(/no fields/i);
		expect(dbHolder.current.statements).toHaveLength(0);
	});

	it("reports a duplicate username as a DuplicateUserError", async () => {
		dbHolder.current.queueError(uniqueConstraintError("username"));

		await expect(updateUser(USER.id, { username: "taken" })).rejects.toMatchObject({
			field: "username",
		});
	});
});

describe("deleteUser", () => {
	it("returns true when a row was removed", async () => {
		dbHolder.current.queueRun(1);

		await expect(deleteUser(USER.id)).resolves.toBe(true);
	});

	it("returns false when no row matched", async () => {
		dbHolder.current.queueRun(0);

		await expect(deleteUser("missing-id")).resolves.toBe(false);
	});

	it("deletes by bound id", async () => {
		dbHolder.current.queueRun(1);

		await deleteUser(USER.id);

		const statement = dbHolder.current.lastStatement();
		expect(statement.sql.toLowerCase()).toContain("delete from users where id = ?1");
		expect(statement.bindings).toEqual([USER.id]);
	});
});

describe("toPublicUser", () => {
	it("removes the password hash", () => {
		const publicUser = toPublicUser(USER);

		expect(publicUser).not.toHaveProperty("passwordHash");
		expect(publicUser).toEqual({
			id: USER.id,
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@example.com",
			createdAt: USER.createdAt,
			updatedAt: USER.updatedAt,
		});
	});
});

describe("d1.mdc conventions", () => {
	it("never uses anonymous placeholders", async () => {
		dbHolder.current.queueRows([ROW]);
		await createUser(NEW_USER_INPUT);
		dbHolder.current.queueRows([ROW]);
		await findUserById(USER.id);
		dbHolder.current.queueRows([ROW]);
		await updateUser(USER.id, { firstName: "Augusta", email: "a@example.com" });
		dbHolder.current.queueRun(1);
		await deleteUser(USER.id);

		expect(dbHolder.current.statements.length).toBeGreaterThan(0);
		for (const { sql } of dbHolder.current.statements) {
			expect(sql).not.toMatch(/\?(?!\d)/);
		}
	});

	it("numbers placeholders consecutively from ?1 in a multi-column update", async () => {
		dbHolder.current.queueRows([ROW]);

		await updateUser(USER.id, {
			firstName: "Augusta",
			lastName: "King",
			email: "augusta@example.com",
		});

		const { sql, bindings } = dbHolder.current.lastStatement();
		expect(sql).toContain("first_name = ?1");
		expect(sql).toContain("last_name = ?2");
		expect(sql).toContain("email = ?3");
		expect(sql).toContain("id = ?4");
		expect(bindings).toEqual([
			"Augusta",
			"King",
			"augusta@example.com",
			USER.id,
		]);
	});
});
