// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttemptForm } from "./attempt-form";

const QUESTION = {
	id: "9f2c",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	createdBy: null,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
	// Deliberately out of order, so the form is shown to sort by position.
	choices: [
		{ id: "3c6d", text: "Marseille", position: 2 },
		{ id: "1a4b", text: "Paris", position: 0 },
		{ id: "2b5c", text: "Lyon", position: 1 },
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

function correctResponse(choiceId: string, isCorrect: boolean) {
	return {
		attempt: {
			id: "7e8f",
			questionId: "9f2c",
			userId: null,
			choiceId,
			isCorrect,
			createdAt: "2026-08-31 14:09:44",
		},
		correctChoiceId: "1a4b",
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("AttemptForm", () => {
	it("shows the question and every choice in position order", () => {
		render(<AttemptForm question={QUESTION} />);

		expect(screen.getByRole("heading", { name: "Capital of France" })).toBeTruthy();
		expect(
			screen.getByText("Which city is the capital of France?"),
		).toBeTruthy();
		expect(
			screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label")),
		).toEqual(["Paris", "Lyon", "Marseille"]);
	});

	it("never shows which answer is correct before it is submitted", () => {
		render(<AttemptForm question={QUESTION} />);

		expect(screen.queryByText(/correct answer was/i)).toBeNull();
		expect(screen.queryByText("Correct")).toBeNull();
	});

	it("will not submit until a choice is chosen", () => {
		render(<AttemptForm question={QUESTION} />);

		expect(
			screen.getByRole("button", { name: "Submit answer" }).hasAttribute("disabled"),
		).toBe(true);
	});

	it("enables submit once a choice is chosen", async () => {
		const user = userEvent.setup();
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));

		expect(
			screen.getByRole("button", { name: "Submit answer" }).hasAttribute("disabled"),
		).toBe(false);
	});

	it("offers a way back to the list", () => {
		render(<AttemptForm question={QUESTION} />);

		expect(
			screen.getByRole("link", { name: "Back to questions" }).getAttribute("href"),
		).toBe("/mcq");
	});

	it("posts only the chosen id to the attempts endpoint", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, correctResponse("1a4b", true));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c/attempts");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({ choiceId: "1a4b" });
	});

	it("says in words, not only in colour, that the answer was right", async () => {
		const user = userEvent.setup();
		stubFetch(201, correctResponse("1a4b", true));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		const result = await waitFor(() => screen.getByRole("status"));
		expect(result.textContent).toContain("Correct");
	});

	it("says in words that the answer was wrong, and names the right one", async () => {
		const user = userEvent.setup();
		stubFetch(201, correctResponse("2b5c", false));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Lyon" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		const result = await waitFor(() => screen.getByRole("status"));
		expect(result.textContent).toContain("Not quite");
		expect(result.textContent).toContain("Paris");
	});

	it("marks the correct choice in the list after submitting", async () => {
		const user = userEvent.setup();
		stubFetch(201, correctResponse("2b5c", false));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Lyon" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		expect(screen.getByTestId("choice-1a4b").textContent).toContain(
			"Correct answer",
		);
	});

	it("locks the choices after submitting, so a double click cannot record twice", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, correctResponse("1a4b", true));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		expect(screen.queryByRole("button", { name: "Submit answer" })).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("offers a try again control that clears the result", async () => {
		const user = userEvent.setup();
		stubFetch(201, correctResponse("1a4b", true));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());

		await user.click(screen.getByRole("button", { name: "Try again" }));

		expect(screen.queryByRole("status")).toBeNull();
		expect(screen.getByRole("button", { name: "Submit answer" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Submit answer" }).hasAttribute("disabled"),
		).toBe(true);
	});

	it("records a second attempt rather than reusing the first", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, correctResponse("1a4b", true));
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));
		await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
		await user.click(screen.getByRole("button", { name: "Try again" }));

		await user.click(screen.getByRole("radio", { name: "Lyon" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	});

	it("reports a failed submission without claiming a verdict", async () => {
		const user = userEvent.setup();
		stubFetch(500, { error: "Could not record attempt" });
		render(<AttemptForm question={QUESTION} />);

		await user.click(screen.getByRole("radio", { name: "Paris" }));
		await user.click(screen.getByRole("button", { name: "Submit answer" }));

		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(screen.getByRole("alert").textContent).toContain(
			"Could not record attempt",
		);
		expect(screen.queryByRole("status")).toBeNull();
	});
});
