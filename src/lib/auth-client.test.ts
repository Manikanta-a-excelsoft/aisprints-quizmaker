import { afterEach, describe, expect, it, vi } from "vitest";

import { GENERIC_ERROR, postAuth } from "./auth-client";

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("postAuth", () => {
	it("posts the body as JSON to the given path", async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user: {} }));
		vi.stubGlobal("fetch", fetchMock);

		await postAuth("/api/auth/login", { username: "ada", password: "secret" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [path, init] = fetchMock.mock.calls[0];
		expect(path).toBe("/api/auth/login");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({ "content-type": "application/json" });
		expect(JSON.parse(init.body)).toEqual({ username: "ada", password: "secret" });
	});

	it("reports success for a 2xx response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(201, { user: {} })));

		await expect(postAuth("/api/auth/register", {})).resolves.toEqual({ ok: true });
	});

	it("returns the per-field messages when the server rejects fields", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse(400, {
					error: "Validation failed",
					fields: { email: "Must be a valid email address" },
				}),
			),
		);

		await expect(postAuth("/api/auth/register", {})).resolves.toEqual({
			ok: false,
			fields: { email: "Must be a valid email address" },
			message: null,
		});
	});

	it("returns a form-level message when the server sends an error without fields", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse(400, { error: "Username already taken" })),
		);

		await expect(postAuth("/api/auth/register", {})).resolves.toEqual({
			ok: false,
			fields: {},
			message: "Username already taken",
		});
	});

	it("passes the 401 credential message through", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid credentials" })),
		);

		await expect(postAuth("/api/auth/login", {})).resolves.toEqual({
			ok: false,
			fields: {},
			message: "Invalid credentials",
		});
	});

	it("falls back to a generic message when the error body is unreadable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 500 })),
		);

		await expect(postAuth("/api/auth/login", {})).resolves.toEqual({
			ok: false,
			fields: {},
			message: GENERIC_ERROR,
		});
	});

	it("returns a generic message instead of throwing when the network fails", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

		await expect(postAuth("/api/auth/login", {})).resolves.toEqual({
			ok: false,
			fields: {},
			message: GENERIC_ERROR,
		});
	});
});
