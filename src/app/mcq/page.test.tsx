// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import McqPage from "./page";

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		refresh: vi.fn(),
		prefetch: vi.fn(),
	}),
}));

describe("MCQ stub page", () => {
	it("shows the quiz heading", () => {
		render(<McqPage />);

		expect(
			screen.getByRole("heading", { name: "Multiple choice quiz" }),
		).toBeTruthy();
	});

	it("says the quiz itself is not built yet", () => {
		render(<McqPage />);

		expect(screen.getByText(/later sprint/i)).toBeTruthy();
	});

	it("offers the logout control", () => {
		render(<McqPage />);

		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
	});
});
