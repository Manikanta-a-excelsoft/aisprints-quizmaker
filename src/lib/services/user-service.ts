import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * All database access for users lives here, so route handlers never touch `env.DB`
 * directly. `passwordHash` is always an already-derived hash; this module never hashes,
 * never verifies, and never sees a plaintext password.
 */
export type User = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
	createdAt: string;
	updatedAt: string;
};

/** The shape safe to send to a client. */
export type PublicUser = Omit<User, "passwordHash">;

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserInput = Partial<CreateUserInput>;

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	created_at: string;
	updated_at: string;
};

export type DuplicateField = "username" | "email";

/** Raised when a unique constraint rejects a write, so callers can answer 400 not 500. */
export class DuplicateUserError extends Error {
	readonly field: DuplicateField;

	constructor(field: DuplicateField) {
		super(`A user with this ${field} already exists`);
		this.name = "DuplicateUserError";
		this.field = field;
	}
}

const COLUMNS =
	"id, first_name, last_name, username, email, password_hash, created_at, updated_at";

/** Column order used when building an UPDATE, so placeholder numbering is predictable. */
const UPDATABLE_COLUMNS = [
	["firstName", "first_name"],
	["lastName", "last_name"],
	["username", "username"],
	["email", "email"],
	["passwordHash", "password_hash"],
] as const;

async function database() {
	const { env } = await getCloudflareContext();
	return env.DB;
}

function toUser(row: UserRow): User {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
		passwordHash: row.password_hash,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function toPublicUser(user: User): PublicUser {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

/**
 * D1 surfaces a unique violation as a message rather than a typed error, so the column
 * is read back out of it. Anything else is left alone for the caller to handle.
 */
function asDuplicateUserError(error: unknown): DuplicateUserError | null {
	const message = error instanceof Error ? error.message : String(error);
	const field = message.match(/UNIQUE constraint failed: users\.(\w+)/)?.[1];

	if (field === "username" || field === "email") {
		return new DuplicateUserError(field);
	}

	return null;
}

export async function createUser(input: CreateUserInput): Promise<User> {
	const db = await database();

	let results: UserRow[];
	try {
		({ results } = await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING ${COLUMNS}`,
			)
			.bind(
				input.firstName,
				input.lastName,
				input.username,
				input.email,
				input.passwordHash,
			)
			.all<UserRow>());
	} catch (error) {
		const duplicate = asDuplicateUserError(error);
		if (duplicate) {
			throw duplicate;
		}
		throw error;
	}

	const row = results[0];
	if (!row) {
		throw new Error("User could not be created: the insert returned no row");
	}

	return toUser(row);
}

async function findUserBy(
	column: "id" | "username" | "email",
	value: string,
): Promise<User | null> {
	const db = await database();
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM users WHERE ${column} = ?1`)
		.bind(value)
		.all<UserRow>();

	return results[0] ? toUser(results[0]) : null;
}

export function findUserById(id: string): Promise<User | null> {
	return findUserBy("id", id);
}

export function findUserByUsername(username: string): Promise<User | null> {
	return findUserBy("username", username);
}

export function findUserByEmail(email: string): Promise<User | null> {
	return findUserBy("email", email);
}

export async function updateUser(
	id: string,
	changes: UpdateUserInput,
): Promise<User | null> {
	const assignments: string[] = [];
	const bindings: unknown[] = [];

	for (const [key, column] of UPDATABLE_COLUMNS) {
		const value = changes[key];
		if (value !== undefined) {
			bindings.push(value);
			assignments.push(`${column} = ?${bindings.length}`);
		}
	}

	if (assignments.length === 0) {
		throw new Error("updateUser was given no fields to change");
	}

	bindings.push(id);

	const db = await database();

	let results: UserRow[];
	try {
		({ results } = await db
			.prepare(
				`UPDATE users SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?${bindings.length} RETURNING ${COLUMNS}`,
			)
			.bind(...bindings)
			.all<UserRow>());
	} catch (error) {
		const duplicate = asDuplicateUserError(error);
		if (duplicate) {
			throw duplicate;
		}
		throw error;
	}

	return results[0] ? toUser(results[0]) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
	const db = await database();
	const { meta } = await db
		.prepare("DELETE FROM users WHERE id = ?1")
		.bind(id)
		.run();

	return meta.changes > 0;
}
