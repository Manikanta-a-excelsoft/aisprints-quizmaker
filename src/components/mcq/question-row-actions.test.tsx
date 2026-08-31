// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionRowActions } from "./question-row-actions";

const { success, error } = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success, error } }));

// Base UI positions the menu and the dialog with browser APIs jsdom does not implement.
// Without these the popup renders empty.
beforeAll(() => {
	Element.prototype.hasPointerCapture = () => false;
	Element.prototype.setPointerCapture = () => {};
	Element.prototype.releasePointerCapture = () => {};
	Element.prototype.scrollIntoView = () => {};
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

const QUESTION = {
	id: "9f2c",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choiceCount: 3,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
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

/**
 * Base UI's trigger will not open under jsdom — it can close a menu but not open one, so
 * clicking it here would assert nothing. The menu is started open instead, and opening it
 * by click is covered by the browser walkthrough.
 */
function renderWithMenuOpen(onDeleted = vi.fn()) {
	render(
		<QuestionRowActions
			question={QUESTION}
			onDeleted={onDeleted}
			defaultMenuOpen
		/>,
	);
}

async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("menuitem", { name: "Delete" }));
	await user.click(screen.getByRole("button", { name: "Delete question" }));
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("QuestionRowActions", () => {
	it("hides the actions behind one trigger rather than three bare buttons", () => {
		render(<QuestionRowActions question={QUESTION} onDeleted={vi.fn()} />);

		expect(
			screen.getByRole("button", { name: "Actions for Capital of France" }),
		).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
	});

	it("offers Preview, Edit and Delete once opened", () => {
		renderWithMenuOpen();

		expect(screen.getByRole("menuitem", { name: "Preview" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
		expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
	});

	it("points Preview at the attempt page and Edit at the edit page", () => {
		renderWithMenuOpen();

		expect(
			screen.getByRole("menuitem", { name: "Preview" }).getAttribute("href"),
		).toBe("/mcq/9f2c/attempt");
		expect(screen.getByRole("menuitem", { name: "Edit" }).getAttribute("href")).toBe(
			"/mcq/9f2c/edit",
		);
	});
});

describe("QuestionRowActions, deleting", () => {
	it("asks for confirmation and names the question, rather than deleting on one click", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { success: true });
		renderWithMenuOpen();

		await user.click(screen.getByRole("menuitem", { name: "Delete" }));

		expect(screen.getByRole("alertdialog")).toBeTruthy();
		expect(screen.getByText(/Capital of France/)).toBeTruthy();
		expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
		// Nothing has been deleted yet.
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("deletes nothing when the confirmation is dismissed", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { success: true });
		const onDeleted = vi.fn();
		renderWithMenuOpen(onDeleted);

		await user.click(screen.getByRole("menuitem", { name: "Delete" }));
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(onDeleted).not.toHaveBeenCalled();
	});

	it("sends the delete once confirmed", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { success: true });
		renderWithMenuOpen();

		await confirmDelete(user);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c");
		expect(init.method).toBe("DELETE");
	});

	it("raises a success toast and tells the list the row has gone", async () => {
		const user = userEvent.setup();
		stubFetch(200, { success: true });
		const onDeleted = vi.fn();
		renderWithMenuOpen(onDeleted);

		await confirmDelete(user);

		await waitFor(() => expect(success).toHaveBeenCalledWith("Question deleted"));
		expect(onDeleted).toHaveBeenCalledWith("9f2c");
	});

	it("reports a failed delete and leaves the row in place", async () => {
		const user = userEvent.setup();
		stubFetch(500, { error: "Could not delete question" });
		const onDeleted = vi.fn();
		renderWithMenuOpen(onDeleted);

		await confirmDelete(user);

		await waitFor(() =>
			expect(error).toHaveBeenCalledWith("Could not delete question"),
		);
		expect(onDeleted).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();
	});
});
