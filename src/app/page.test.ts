import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import Home from "./page";

describe("the site root", () => {
	it("redirects to the login page", () => {
		Home();

		expect(redirect).toHaveBeenCalledWith("/login");
	});
});
