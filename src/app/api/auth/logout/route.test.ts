import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(() => {
		throw new Error("A route test must not reach Cloudflare bindings");
	}),
}));

describe("POST /api/auth/logout", () => {
	it("returns 200 with a success body", async () => {
		const response = await POST();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
	});

	it("sets no cookie, since there is no session to clear", async () => {
		const response = await POST();

		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
