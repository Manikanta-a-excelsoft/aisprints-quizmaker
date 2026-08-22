import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPasswordPlaceholder } from "@/lib/password-placeholder";

import { POST } from "./route";

const { findUserByUsername } = vi.hoisted(() => ({
	findUserByUsername: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(() => {
		throw new Error("A route test must not reach Cloudflare bindings");
	}),
}));

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/services/user-service")>();
	return { ...actual, findUserByUsername };
});

const PASSWORD = "correct horse battery staple";

function request(body: unknown, raw?: string) {
	return new Request("http://localhost:3000/api/auth/login", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: raw ?? JSON.stringify(body),
	});
}

async function storedUser() {
	return {
		id: "0f9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
		firstName: "Ada",
		lastName: "Lovelace",
		username: "ada",
		email: "ada@example.com",
		passwordHash: await hashPasswordPlaceholder(PASSWORD),
		createdAt: "2026-08-22 10:00:00",
		updatedAt: "2026-08-22 10:00:00",
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/auth/login", () => {
	it("returns 200 and the user for correct credentials", async () => {
		const user = await storedUser();
		findUserByUsername.mockResolvedValue(user);

		const response = await POST(request({ username: "ada", password: PASSWORD }));

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			user: {
				id: user.id,
				firstName: "Ada",
				lastName: "Lovelace",
				username: "ada",
				email: "ada@example.com",
				createdAt: user.createdAt,
				updatedAt: user.updatedAt,
			},
		});
	});

	it("looks the user up by the submitted username", async () => {
		findUserByUsername.mockResolvedValue(await storedUser());

		await POST(request({ username: "ada", password: PASSWORD }));

		expect(findUserByUsername).toHaveBeenCalledWith("ada");
	});

	it("never puts the password or its hash in the response", async () => {
		const user = await storedUser();
		findUserByUsername.mockResolvedValue(user);

		const response = await POST(request({ username: "ada", password: PASSWORD }));
		const body = await response.json();

		expect(JSON.stringify(body)).not.toContain(PASSWORD);
		expect(JSON.stringify(body)).not.toContain(user.passwordHash);
		expect(body.user).not.toHaveProperty("passwordHash");
		expect(body.user).not.toHaveProperty("password_hash");
	});

	it("returns 401 when the username is unknown", async () => {
		findUserByUsername.mockResolvedValue(null);

		const response = await POST(request({ username: "nobody", password: PASSWORD }));

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: "Invalid credentials" });
	});

	it("returns 401 when the password is wrong", async () => {
		findUserByUsername.mockResolvedValue(await storedUser());

		const response = await POST(
			request({ username: "ada", password: "not the right password" }),
		);

		expect(response.status).toBe(401);
		await expect(response.json()).resolves.toEqual({ error: "Invalid credentials" });
	});

	it("answers an unknown username and a wrong password identically", async () => {
		findUserByUsername.mockResolvedValue(null);
		const unknown = await POST(request({ username: "nobody", password: PASSWORD }));
		const unknownBody = await unknown.json();

		findUserByUsername.mockResolvedValue(await storedUser());
		const wrongPassword = await POST(
			request({ username: "ada", password: "not the right password" }),
		);
		const wrongPasswordBody = await wrongPassword.json();

		expect(unknown.status).toBe(wrongPassword.status);
		expect(unknownBody).toEqual(wrongPasswordBody);
	});

	it.each([
		["username", { username: "", password: PASSWORD }],
		["password", { username: "ada", password: "" }],
	])("returns 400 naming the missing %s", async (field, body) => {
		const response = await POST(request(body));

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json.error).toBe("Validation failed");
		expect(json.fields).toHaveProperty(field);
		expect(findUserByUsername).not.toHaveBeenCalled();
	});

	it("returns 400 for a malformed JSON body", async () => {
		const response = await POST(request(undefined, "{ not json"));

		expect(response.status).toBe(400);
		expect((await response.json()).error).toBe("Validation failed");
		expect(findUserByUsername).not.toHaveBeenCalled();
	});

	it("returns 500 when the lookup fails unexpectedly", async () => {
		findUserByUsername.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(request({ username: "ada", password: PASSWORD }));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: "Could not sign in" });
	});

	it("sets no cookie, since this sprint has no session management", async () => {
		findUserByUsername.mockResolvedValue(await storedUser());

		const response = await POST(request({ username: "ada", password: PASSWORD }));

		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
