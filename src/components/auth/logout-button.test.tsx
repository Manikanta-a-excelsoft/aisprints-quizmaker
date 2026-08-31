// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LogoutButton } from "./logout-button";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("LogoutButton", () => {
	it("renders a button named Log out", () => {
		render(<LogoutButton />);

		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
	});

	it("calls the logout endpoint and returns to the login page", async () => {
		const user = userEvent.setup();
		const fetchMock = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ success: true }), { status: 200 }),
			);
		vi.stubGlobal("fetch", fetchMock);
		render(<LogoutButton />);

		await user.click(screen.getByRole("button", { name: "Log out" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/logout");
		expect(fetchMock.mock.calls[0][1].method).toBe("POST");
	});

	it("still returns to the login page when the request fails", async () => {
		const user = userEvent.setup();
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
		render(<LogoutButton />);

		await user.click(screen.getByRole("button", { name: "Log out" }));

		await waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
	});
});
