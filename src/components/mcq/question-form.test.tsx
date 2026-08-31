// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionForm } from "./question-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const { success } = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("sonner", () => ({
	toast: { success, error: vi.fn() },
}));

const EXISTING = {
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

function choiceInput(position: number) {
	return screen.getByRole("textbox", { name: `Choice ${position}` });
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByRole("textbox", { name: "Name" }), "Capital of France");
	await user.type(
		screen.getByRole("textbox", { name: "Question text" }),
		"Which city is the capital of France?",
	);
	await user.type(choiceInput(1), "Paris");
	await user.type(choiceInput(2), "Lyon");
	await user.click(screen.getByRole("radio", { name: "Mark choice 1 as correct" }));
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("QuestionForm, create mode", () => {
	it("shows a heading, both text fields and a submit button", () => {
		render(<QuestionForm mode="create" />);

		expect(screen.getByRole("heading", { name: "New question" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Name" })).toBeTruthy();
		expect(screen.getByRole("textbox", { name: "Question text" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Create question" })).toBeTruthy();
	});

	it("starts with two empty choices, the minimum a question can have", () => {
		render(<QuestionForm mode="create" />);

		expect(choiceInput(1)).toBeTruthy();
		expect(choiceInput(2)).toBeTruthy();
		expect(screen.queryByRole("textbox", { name: "Choice 3" })).toBeNull();
	});

	it("offers a way back to the list without saving", () => {
		render(<QuestionForm mode="create" />);

		expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe(
			"/mcq",
		);
	});

	it("adds a choice when asked", async () => {
		const user = userEvent.setup();
		render(<QuestionForm mode="create" />);

		await user.click(screen.getByRole("button", { name: "Add choice" }));

		expect(choiceInput(3)).toBeTruthy();
	});

	it("removes a choice when asked, keeping the remaining text", async () => {
		const user = userEvent.setup();
		render(<QuestionForm mode="create" />);

		await user.click(screen.getByRole("button", { name: "Add choice" }));
		await user.type(choiceInput(1), "Paris");
		await user.type(choiceInput(3), "Marseille");
		await user.click(screen.getByRole("button", { name: "Remove choice 2" }));

		expect(screen.queryByRole("textbox", { name: "Choice 3" })).toBeNull();
		expect((choiceInput(1) as HTMLInputElement).value).toBe("Paris");
		expect((choiceInput(2) as HTMLInputElement).value).toBe("Marseille");
	});

	it("will not let the choice list drop below two", async () => {
		render(<QuestionForm mode="create" />);

		expect(
			screen.getByRole("button", { name: "Remove choice 1" }).hasAttribute("disabled"),
		).toBe(true);
		expect(
			screen.getByRole("button", { name: "Remove choice 2" }).hasAttribute("disabled"),
		).toBe(true);
	});

	it("will not let the choice list grow past six, and says why", async () => {
		const user = userEvent.setup();
		render(<QuestionForm mode="create" />);

		const add = screen.getByRole("button", { name: "Add choice" });
		for (let i = 0; i < 4; i += 1) {
			await user.click(add);
		}

		expect(choiceInput(6)).toBeTruthy();
		expect(screen.queryByRole("textbox", { name: "Choice 7" })).toBeNull();
		expect(add.hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("A question can have at most six choices")).toBeTruthy();
	});

	it("marks exactly one choice correct, moving the mark rather than adding a second", async () => {
		const user = userEvent.setup();
		render(<QuestionForm mode="create" />);

		await user.click(screen.getByRole("radio", { name: "Mark choice 1 as correct" }));
		await user.click(screen.getByRole("radio", { name: "Mark choice 2 as correct" }));

		const radios = screen.getAllByRole("radio");
		const checked = radios.filter(
			(radio) => radio.getAttribute("aria-checked") === "true",
		);
		expect(checked).toHaveLength(1);
	});

	it("reports every empty field without calling the API", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, {});
		render(<QuestionForm mode="create" />);

		await user.click(screen.getByRole("button", { name: "Create question" }));

		expect(screen.getByText("Name is required")).toBeTruthy();
		expect(screen.getByText("Question text is required")).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("refuses to submit when no choice is marked correct", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, {});
		render(<QuestionForm mode="create" />);

		await user.type(screen.getByRole("textbox", { name: "Name" }), "Capital");
		await user.type(screen.getByRole("textbox", { name: "Question text" }), "Which?");
		await user.type(choiceInput(1), "Paris");
		await user.type(choiceInput(2), "Lyon");
		await user.click(screen.getByRole("button", { name: "Create question" }));

		expect(
			screen.getByText("Mark exactly one choice as the correct answer"),
		).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("puts a blank choice's error against that choice's own row", async () => {
		const user = userEvent.setup();
		stubFetch(201, {});
		render(<QuestionForm mode="create" />);

		await user.type(screen.getByRole("textbox", { name: "Name" }), "Capital");
		await user.type(screen.getByRole("textbox", { name: "Question text" }), "Which?");
		await user.type(choiceInput(1), "Paris");
		await user.click(screen.getByRole("radio", { name: "Mark choice 1 as correct" }));
		await user.click(screen.getByRole("button", { name: "Create question" }));

		const error = screen.getByText("Choice text is required");
		expect(error).toBeTruthy();
		expect(choiceInput(2).getAttribute("aria-invalid")).toBe("true");
		expect(choiceInput(1).getAttribute("aria-invalid")).not.toBe("true");
	});

	it("posts to the collection endpoint and sends the array order as the order", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(201, { question: EXISTING });
		render(<QuestionForm mode="create" />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: "Create question" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({
			name: "Capital of France",
			questionText: "Which city is the capital of France?",
			choices: [
				{ text: "Paris", isCorrect: true },
				{ text: "Lyon", isCorrect: false },
			],
		});
	});

	it("raises a success toast and returns to the list", async () => {
		const user = userEvent.setup();
		stubFetch(201, { question: EXISTING });
		render(<QuestionForm mode="create" />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: "Create question" }));

		await waitFor(() => expect(success).toHaveBeenCalledWith("Question created"));
		expect(push).toHaveBeenCalledWith("/mcq");
	});

	it("shows a server validation error against the right field", async () => {
		const user = userEvent.setup();
		stubFetch(400, {
			error: "Validation failed",
			fields: { name: "Name must be at most 100 characters" },
		});
		render(<QuestionForm mode="create" />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: "Create question" }));

		await waitFor(() =>
			expect(screen.getByText("Name must be at most 100 characters")).toBeTruthy(),
		);
		expect(push).not.toHaveBeenCalled();
	});

	it("shows a form-level message when the server fails without field detail", async () => {
		const user = userEvent.setup();
		stubFetch(500, { error: "Could not create question" });
		render(<QuestionForm mode="create" />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: "Create question" }));

		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(screen.getByRole("alert").textContent).toContain(
			"Could not create question",
		);
		expect(push).not.toHaveBeenCalled();
	});

	it("does not raise a success toast when the save failed", async () => {
		const user = userEvent.setup();
		stubFetch(500, { error: "Could not create question" });
		render(<QuestionForm mode="create" />);

		await fillValid(user);
		await user.click(screen.getByRole("button", { name: "Create question" }));

		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(success).not.toHaveBeenCalled();
	});
});

describe("QuestionForm, edit mode", () => {
	it("seeds every field from the question it was given", () => {
		render(<QuestionForm mode="edit" question={EXISTING} />);

		expect(screen.getByRole("heading", { name: "Edit question" })).toBeTruthy();
		expect(
			(screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value,
		).toBe("Capital of France");
		expect(
			(screen.getByRole("textbox", { name: "Question text" }) as HTMLTextAreaElement)
				.value,
		).toBe("Which city is the capital of France?");
		expect((choiceInput(1) as HTMLInputElement).value).toBe("Paris");
		expect((choiceInput(2) as HTMLInputElement).value).toBe("Lyon");
	});

	it("pre-selects the choice that is already correct", () => {
		render(<QuestionForm mode="edit" question={EXISTING} />);

		expect(
			screen
				.getByRole("radio", { name: "Mark choice 1 as correct" })
				.getAttribute("aria-checked"),
		).toBe("true");
	});

	it("labels the submit button as saving rather than creating", () => {
		render(<QuestionForm mode="edit" question={EXISTING} />);

		expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create question" })).toBeNull();
	});

	it("puts to the question's own URL and sends no choice ids", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { question: EXISTING });
		render(<QuestionForm mode="edit" question={EXISTING} />);

		await user.clear(screen.getByRole("textbox", { name: "Name" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "Capital city");
		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c");
		expect(init.method).toBe("PUT");
		const body = JSON.parse(init.body);
		expect(body.name).toBe("Capital city");
		// Editing replaces the choice set, so an id would carry no meaning.
		expect(body.choices[0]).toEqual({ text: "Paris", isCorrect: true });
	});

	it("raises an update toast, not a create toast", async () => {
		const user = userEvent.setup();
		stubFetch(200, { question: EXISTING });
		render(<QuestionForm mode="edit" question={EXISTING} />);

		await user.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(success).toHaveBeenCalledWith("Question updated"));
		expect(push).toHaveBeenCalledWith("/mcq");
	});

	it("can add a choice to a question that was saved with two", async () => {
		const user = userEvent.setup();
		render(<QuestionForm mode="edit" question={EXISTING} />);

		await user.click(screen.getByRole("button", { name: "Add choice" }));
		await user.type(choiceInput(3), "Nice");

		expect((choiceInput(3) as HTMLInputElement).value).toBe("Nice");
	});
});
