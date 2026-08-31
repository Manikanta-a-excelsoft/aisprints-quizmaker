// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionLoader } from "./question-loader";

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		refresh: vi.fn(),
		prefetch: vi.fn(),
	}),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const QUESTION = {
	id: "9f2c",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	createdBy: null,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
	choices: [
		{ id: "1a4b", text: "Paris", isCorrect: true, position: 0 },
		{ id: "2b5c", text: "Lyon", isCorrect: false, position: 1 },
	],
};

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function stubFetch(status: number, body: unknown) {
	const fetchMock = vi.fn().mockResolvedValue(jsonResponse(status, body));
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("QuestionLoader, edit mode", () => {
	it("asks for the answers, because the form has to show which choice is correct", async () => {
		const fetchMock = stubFetch(200, { question: QUESTION });
		render(<QuestionLoader id="9f2c" mode="edit" />);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/mcq/9f2c?include=answers",
			expect.anything(),
		);
	});

	it("renders the form seeded from the question once it arrives", async () => {
		stubFetch(200, { question: QUESTION });
		render(<QuestionLoader id="9f2c" mode="edit" />);

		await waitFor(() =>
			expect(screen.getByRole("heading", { name: "Edit question" })).toBeTruthy(),
		);
		expect(
			(screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value,
		).toBe("Capital of France");
	});

	it("shows a not-found state rather than crashing on a missing id", async () => {
		stubFetch(404, { error: "Question not found" });
		render(<QuestionLoader id="missing" mode="edit" />);

		await waitFor(() => expect(screen.getByText("Question not found")).toBeTruthy());
		expect(
			screen.getByRole("link", { name: "Back to questions" }).getAttribute("href"),
		).toBe("/mcq");
		expect(screen.queryByRole("heading", { name: "Edit question" })).toBeNull();
	});

	it("reports a load failure separately from a missing question", async () => {
		stubFetch(500, { error: "Could not load question" });
		render(<QuestionLoader id="9f2c" mode="edit" />);

		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(screen.getByRole("alert").textContent).toContain(
			"Could not load question",
		);
		expect(screen.queryByText("Question not found")).toBeNull();
	});
});

describe("QuestionLoader, attempt mode", () => {
	it("asks for the question without the answers", async () => {
		const fetchMock = stubFetch(200, {
			question: {
				...QUESTION,
				choices: [
					{ id: "1a4b", text: "Paris", position: 0 },
					{ id: "2b5c", text: "Lyon", position: 1 },
				],
			},
		});
		render(<QuestionLoader id="9f2c" mode="attempt" />);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledWith("/api/mcq/9f2c", expect.anything());
	});

	it("renders the attempt form once the question arrives", async () => {
		stubFetch(200, {
			question: {
				...QUESTION,
				choices: [
					{ id: "1a4b", text: "Paris", position: 0 },
					{ id: "2b5c", text: "Lyon", position: 1 },
				],
			},
		});
		render(<QuestionLoader id="9f2c" mode="attempt" />);

		await waitFor(() =>
			expect(
				screen.getByRole("heading", { name: "Capital of France" }),
			).toBeTruthy(),
		);
		expect(screen.getByRole("button", { name: "Submit answer" })).toBeTruthy();
	});

	it("shows a not-found state for a missing id", async () => {
		stubFetch(404, { error: "Question not found" });
		render(<QuestionLoader id="missing" mode="attempt" />);

		await waitFor(() => expect(screen.getByText("Question not found")).toBeTruthy());
	});
});
