// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import McqPage from "./page";

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		refresh: vi.fn(),
		prefetch: vi.fn(),
	}),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function stubFetch(body: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		),
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("MCQ list page", () => {
	it("shows the question bank heading", () => {
		stubFetch({ questions: [] });
		render(<McqPage />);

		expect(
			screen.getByRole("heading", { name: "Multiple choice questions" }),
		).toBeTruthy();
	});

	it("offers a way to create a question", () => {
		stubFetch({ questions: [] });
		render(<McqPage />);

		expect(
			screen.getByRole("link", { name: "New question" }).getAttribute("href"),
		).toBe("/mcq/new");
	});

	it("offers the logout control", () => {
		stubFetch({ questions: [] });
		render(<McqPage />);

		expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
	});

	it("no longer claims the quiz is left to a later sprint", async () => {
		stubFetch({ questions: [] });
		render(<McqPage />);

		await waitFor(() => expect(screen.getByText("No questions yet")).toBeTruthy());
		expect(screen.queryByText(/later sprint/i)).toBeNull();
		expect(screen.queryByText("Placeholder")).toBeNull();
	});

	it("renders the questions it loads", async () => {
		stubFetch({
			questions: [
				{
					id: "9f2c",
					name: "Capital of France",
					questionText: "Which city is the capital of France?",
					choiceCount: 3,
					createdAt: "2026-08-31 14:02:11",
					updatedAt: "2026-08-31 14:02:11",
				},
			],
		});
		render(<McqPage />);

		await waitFor(() =>
			expect(screen.getByText("Capital of France")).toBeTruthy(),
		);
	});
});
