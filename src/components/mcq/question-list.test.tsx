// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionList } from "./question-list";

vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		refresh: vi.fn(),
		prefetch: vi.fn(),
	}),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

const CAPITAL = {
	id: "9f2c",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choiceCount: 3,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
};

const PLANET = {
	id: "149d",
	name: "Largest planet",
	questionText: "Which is the largest planet in the solar system?",
	choiceCount: 2,
	createdAt: "2026-08-31 14:05:00",
	updatedAt: "2026-08-31 14:05:00",
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

/** Resolves only when the caller decides, so the loading state can be observed. */
function stubPendingFetch() {
	let release: (value: Response) => void = () => {};
	const pending = new Promise<Response>((resolve) => {
		release = resolve;
	});
	vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
	return { release };
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("QuestionList, while loading", () => {
	it("shows skeleton rows rather than an empty table", async () => {
		const { release } = stubPendingFetch();
		render(<QuestionList />);

		expect(screen.getAllByTestId("question-skeleton-row").length).toBeGreaterThan(0);

		release(jsonResponse(200, { questions: [] }));
		await waitFor(() =>
			expect(screen.queryByTestId("question-skeleton-row")).toBeNull(),
		);
	});

	it("does not show the empty state while it is still loading", () => {
		stubPendingFetch();
		render(<QuestionList />);

		expect(screen.queryByText("No questions yet")).toBeNull();
	});
});

describe("QuestionList, with questions", () => {
	it("shows a row per question with its name, question text and choice count", async () => {
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		expect(screen.getByText("Largest planet")).toBeTruthy();
		expect(
			screen.getByText("Which city is the capital of France?"),
		).toBeTruthy();

		const row = screen.getByText("Capital of France").closest("tr");
		expect(row).not.toBeNull();
		expect(within(row as HTMLElement).getByText("3")).toBeTruthy();
	});

	it("keeps the order the API returned", async () => {
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());

		const names = screen
			.getAllByTestId("question-name")
			.map((cell) => cell.textContent);
		expect(names).toEqual(["Largest planet", "Capital of France"]);
	});

	it("fetches the list once, on mount", async () => {
		const fetchMock = stubFetch(200, { questions: [CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith("/api/mcq", expect.anything());
	});
});

describe("QuestionList, search", () => {
	it("filters the rows already loaded, without another request", async () => {
		const user = userEvent.setup();
		const fetchMock = stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		await user.type(screen.getByRole("textbox", { name: "Search questions" }), "planet");

		expect(screen.getByText("Largest planet")).toBeTruthy();
		expect(screen.queryByText("Capital of France")).toBeNull();
		// The whole point of in-memory search: still exactly one request.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("matches the question text as well as the name", async () => {
		const user = userEvent.setup();
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		await user.type(screen.getByRole("textbox", { name: "Search questions" }), "solar");

		expect(screen.getByText("Largest planet")).toBeTruthy();
		expect(screen.queryByText("Capital of France")).toBeNull();
	});

	it("ignores case", async () => {
		const user = userEvent.setup();
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		await user.type(screen.getByRole("textbox", { name: "Search questions" }), "CAPITAL");

		expect(screen.getByText("Capital of France")).toBeTruthy();
		expect(screen.queryByText("Largest planet")).toBeNull();
	});

	it("says there are no matches rather than showing the empty-bank card", async () => {
		const user = userEvent.setup();
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		await user.type(
			screen.getByRole("textbox", { name: "Search questions" }),
			"nothing matches this",
		);

		expect(screen.getByText("No questions match that search")).toBeTruthy();
		// An empty bank and an unmatched filter are different situations.
		expect(screen.queryByText("No questions yet")).toBeNull();
	});

	it("restores every row when the search is cleared", async () => {
		const user = userEvent.setup();
		stubFetch(200, { questions: [PLANET, CAPITAL] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("Capital of France")).toBeTruthy());
		const search = screen.getByRole("textbox", { name: "Search questions" });
		await user.type(search, "planet");
		await user.clear(search);

		expect(screen.getByText("Capital of France")).toBeTruthy();
		expect(screen.getByText("Largest planet")).toBeTruthy();
	});
});

describe("QuestionList, empty bank", () => {
	it("shows an empty state card instead of a table", async () => {
		stubFetch(200, { questions: [] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("No questions yet")).toBeTruthy());
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("offers a button to create the first question", async () => {
		stubFetch(200, { questions: [] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("No questions yet")).toBeTruthy());
		expect(
			screen
				.getByRole("link", { name: "Create your first question" })
				.getAttribute("href"),
		).toBe("/mcq/new");
	});

	it("does not show the search box when there is nothing to search", async () => {
		stubFetch(200, { questions: [] });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByText("No questions yet")).toBeTruthy());
		expect(screen.queryByRole("textbox", { name: "Search questions" })).toBeNull();
	});
});

describe("QuestionList, when loading fails", () => {
	it("says so instead of pretending the bank is empty", async () => {
		stubFetch(500, { error: "Could not load questions" });
		render(<QuestionList />);

		await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
		expect(screen.getByRole("alert").textContent).toContain(
			"Could not load questions",
		);
		expect(screen.queryByText("No questions yet")).toBeNull();
	});
});
