import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	GENERIC_ERROR,
	createQuestion,
	deleteQuestion,
	fetchQuestion,
	fetchQuestions,
	submitAttempt,
	updateQuestion,
} from "./mcq-client";

const SUMMARY = {
	id: "9f2c",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choiceCount: 3,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
};

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

const FORM_VALUES = {
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choices: [
		{ text: "Paris", isCorrect: true },
		{ text: "Lyon", isCorrect: false },
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

describe("fetchQuestions", () => {
	it("returns the questions array on success", async () => {
		stubFetch(200, { questions: [SUMMARY] });

		const result = await fetchQuestions();

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toEqual([SUMMARY]);
	});

	it("returns an empty array for an empty bank", async () => {
		stubFetch(200, { questions: [] });

		const result = await fetchQuestions();

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data).toEqual([]);
	});

	it("requests the collection endpoint", async () => {
		const fetchMock = stubFetch(200, { questions: [] });

		await fetchQuestions();

		expect(fetchMock).toHaveBeenCalledWith("/api/mcq", expect.anything());
	});

	it("surfaces the server message on failure", async () => {
		stubFetch(500, { error: "Could not load questions" });

		const result = await fetchQuestions();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toBe("Could not load questions");
		expect(result.status).toBe(500);
	});

	it("falls back to a generic message when the network fails", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

		const result = await fetchQuestions();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toBe(GENERIC_ERROR);
	});

	it("falls back to a generic message when the body is not JSON", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })),
		);

		const result = await fetchQuestions();

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toBe(GENERIC_ERROR);
	});
});

describe("fetchQuestion", () => {
	it("returns the question on success", async () => {
		stubFetch(200, { question: QUESTION });

		const result = await fetchQuestion("9f2c");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.choices).toHaveLength(2);
	});

	it("asks for the plain question by default, without the answers", async () => {
		const fetchMock = stubFetch(200, { question: QUESTION });

		await fetchQuestion("9f2c");

		expect(fetchMock).toHaveBeenCalledWith("/api/mcq/9f2c", expect.anything());
	});

	it("asks for the answers when told to", async () => {
		const fetchMock = stubFetch(200, { question: QUESTION });

		await fetchQuestion("9f2c", { includeAnswers: true });

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/mcq/9f2c?include=answers",
			expect.anything(),
		);
	});

	it("reports a 404 with its status, so a caller can show a not-found state", async () => {
		stubFetch(404, { error: "Question not found" });

		const result = await fetchQuestion("missing");

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(404);
		expect(result.message).toBe("Question not found");
	});
});

describe("createQuestion", () => {
	it("posts the form values as JSON", async () => {
		const fetchMock = stubFetch(201, { question: QUESTION });

		await createQuestion(FORM_VALUES);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual(FORM_VALUES);
	});

	it("returns the created question", async () => {
		stubFetch(201, { question: QUESTION });

		const result = await createQuestion(FORM_VALUES);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.id).toBe("9f2c");
	});

	it("splits per-field validation errors out of a 400", async () => {
		stubFetch(400, {
			error: "Validation failed",
			fields: { name: "Name is required", "choices.1.text": "Choice text is required" },
		});

		const result = await createQuestion(FORM_VALUES);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.fields).toEqual({
			name: "Name is required",
			"choices.1.text": "Choice text is required",
		});
		// The inputs carry the detail, so a form-level message would only repeat it.
		expect(result.message).toBeNull();
	});

	it("keeps a form-level message when the error has no fields", async () => {
		stubFetch(500, { error: "Could not create question" });

		const result = await createQuestion(FORM_VALUES);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.fields).toEqual({});
		expect(result.message).toBe("Could not create question");
	});

	it("ignores non-string values inside fields", async () => {
		stubFetch(400, {
			error: "Validation failed",
			fields: { name: "Name is required", weird: { nested: true } },
		});

		const result = await createQuestion(FORM_VALUES);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.fields).toEqual({ name: "Name is required" });
	});
});

describe("updateQuestion", () => {
	it("puts to the question's own URL", async () => {
		const fetchMock = stubFetch(200, { question: QUESTION });

		await updateQuestion("9f2c", FORM_VALUES);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c");
		expect(init.method).toBe("PUT");
		expect(JSON.parse(init.body)).toEqual(FORM_VALUES);
	});

	it("returns the updated question", async () => {
		stubFetch(200, { question: { ...QUESTION, name: "Changed" } });

		const result = await updateQuestion("9f2c", FORM_VALUES);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.name).toBe("Changed");
	});

	it("reports a 404 for a question that has gone", async () => {
		stubFetch(404, { error: "Question not found" });

		const result = await updateQuestion("missing", FORM_VALUES);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.status).toBe(404);
	});
});

describe("deleteQuestion", () => {
	it("sends DELETE to the question's own URL", async () => {
		const fetchMock = stubFetch(200, { success: true });

		await deleteQuestion("9f2c");

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c");
		expect(init.method).toBe("DELETE");
	});

	it("reports success", async () => {
		stubFetch(200, { success: true });

		await expect(deleteQuestion("9f2c")).resolves.toMatchObject({ ok: true });
	});

	it("reports a 404 for a question that has already gone", async () => {
		stubFetch(404, { error: "Question not found" });

		const result = await deleteQuestion("missing");

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toBe("Question not found");
	});
});

describe("submitAttempt", () => {
	it("posts only the choice id to the nested attempts endpoint", async () => {
		const fetchMock = stubFetch(201, {
			attempt: { id: "7e8f", isCorrect: true, choiceId: "1a4b" },
			correctChoiceId: "1a4b",
		});

		await submitAttempt("9f2c", "1a4b");

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/mcq/9f2c/attempts");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body)).toEqual({ choiceId: "1a4b" });
	});

	it("returns the verdict and the correct choice", async () => {
		stubFetch(201, {
			attempt: { id: "7e8f", isCorrect: false, choiceId: "2b5c" },
			correctChoiceId: "1a4b",
		});

		const result = await submitAttempt("9f2c", "2b5c");

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data.attempt.isCorrect).toBe(false);
		expect(result.data.correctChoiceId).toBe("1a4b");
	});

	it("surfaces a choice that belongs to another question", async () => {
		stubFetch(400, { error: "That choice does not belong to this question" });

		const result = await submitAttempt("9f2c", "elsewhere");

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.message).toBe("That choice does not belong to this question");
	});
});
