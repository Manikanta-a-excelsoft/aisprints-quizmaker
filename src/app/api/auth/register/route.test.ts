import { beforeEach, describe, expect, it, vi } from "vitest";

import { DuplicateUserError } from "@/lib/services/user-service";

import { POST } from "./route";

const { createUser } = vi.hoisted(() => ({ createUser: vi.fn() }));

// Guarantees no test can reach a real database even by accident.
vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(() => {
		throw new Error("A route test must not reach Cloudflare bindings");
	}),
}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/services/user-service")>();
	return { ...actual, createUser };
});

const PASSWORD = "correct horse battery staple";

const VALID_BODY = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	password: PASSWORD,
};

const CREATED_USER = {
	id: "0f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	passwordHash: "sha256-placeholder$deadbeef",
	createdAt: "2026-08-22 10:00:00",
	updatedAt: "2026-08-22 10:00:00",
};

function request(body: unknown, raw?: string) {
	return new Request("http://localhost:3000/api/auth/register", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: raw ?? JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
	it("returns 201 and the created user", async () => {
		createUser.mockResolvedValue(CREATED_USER);

		const response = await POST(request(VALID_BODY));

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			user: {
				id: CREATED_USER.id,
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@example.com",
				createdAt: CREATED_USER.createdAt,
				updatedAt: CREATED_USER.updatedAt,
			},
		});
	});

	it("never puts the password or its hash in the response", async () => {
		createUser.mockResolvedValue(CREATED_USER);

		const response = await POST(request(VALID_BODY));
		const body = await response.json();

		expect(JSON.stringify(body)).not.toContain(PASSWORD);
		expect(JSON.stringify(body)).not.toContain(CREATED_USER.passwordHash);
		expect(body.user).not.toHaveProperty("passwordHash");
		expect(body.user).not.toHaveProperty("password_hash");
		expect(body.user).not.toHaveProperty("password");
	});

	it("hands the service a hash rather than the plaintext password", async () => {
		createUser.mockResolvedValue(CREATED_USER);

		await POST(request(VALID_BODY));

		expect(createUser).toHaveBeenCalledTimes(1);
		const input = createUser.mock.calls[0][0];
		expect(input).not.toHaveProperty("password");
		expect(input.passwordHash).toBeTypeOf("string");
		expect(input.passwordHash).not.toBe(PASSWORD);
		expect(input.passwordHash).not.toContain(PASSWORD);
		expect(input).toMatchObject({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@example.com",
		});
	});

	it.each([
		["firstName", { ...VALID_BODY, firstName: "" }],
		["lastName", { ...VALID_BODY, lastName: "" }],
		["username", { ...VALID_BODY, username: "ab" }],
		["email", { ...VALID_BODY, email: "not-an-email" }],
		["password", { ...VALID_BODY, password: "short" }],
	])("returns 400 naming the invalid %s field", async (field, body) => {
		const response = await POST(request(body));

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe("Validation failed");
		expect(json.fields).toHaveProperty(field);
		expect(json.fields[field]).toBeTypeOf("string");
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 400 when a username exceeds 32 characters", async () => {
		const response = await POST(
			request({ ...VALID_BODY, username: "a".repeat(33) }),
		);

		expect(response.status).toBe(400);
		expect((await response.json()).fields).toHaveProperty("username");
	});

	it("returns 400 when fields are missing entirely", async () => {
		const response = await POST(request({}));

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(Object.keys(json.fields).sort()).toEqual([
			"email",
			"firstName",
			"lastName",
			"password",
			"username",
		]);
	});

	it("returns 400 for a malformed JSON body", async () => {
		const response = await POST(request(undefined, "{ not json"));

		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe("Validation failed");
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 400 when the username is already taken", async () => {
		createUser.mockRejectedValue(new DuplicateUserError("username"));

		const response = await POST(request(VALID_BODY));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Username already taken",
		});
	});

	it("returns 400 when the email is already registered", async () => {
		createUser.mockRejectedValue(new DuplicateUserError("email"));

		const response = await POST(request(VALID_BODY));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Email already registered",
		});
	});

	it("returns 500 when the service fails unexpectedly", async () => {
		createUser.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(request(VALID_BODY));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not create account",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		createUser.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(request(VALID_BODY));

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});
});
