import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./route";

const { createQuestion, listQuestions } = vi.hoisted(() => ({
	createQuestion: vi.fn(),
	listQuestions: vi.fn(),
}));

// Guarantees no test can reach a real database even by accident.
vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(() => {
		throw new Error("A route test must not reach Cloudflare bindings");
	}),
}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return { ...actual, createQuestion, listQuestions };
});

const SUMMARY = {
	id: "9f2c1d3e4f5a6b7c8d9e0f1a2b3c4d5e",
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choiceCount: 3,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
};

const VALID_BODY = {
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choices: [
		{ text: "Paris", isCorrect: true },
		{ text: "Lyon", isCorrect: false },
		{ text: "Marseille", isCorrect: false },
	],
};

const CREATED_QUESTION = {
	id: SUMMARY.id,
	name: VALID_BODY.name,
	questionText: VALID_BODY.questionText,
	createdBy: null,
	createdAt: SUMMARY.createdAt,
	updatedAt: SUMMARY.updatedAt,
	choices: [
		{
			id: "1a4b",
			questionId: SUMMARY.id,
			text: "Paris",
			isCorrect: true,
			position: 0,
			createdAt: SUMMARY.createdAt,
		},
		{
			id: "2b5c",
			questionId: SUMMARY.id,
			text: "Lyon",
			isCorrect: false,
			position: 1,
			createdAt: SUMMARY.createdAt,
		},
		{
			id: "3c6d",
			questionId: SUMMARY.id,
			text: "Marseille",
			isCorrect: false,
			position: 2,
			createdAt: SUMMARY.createdAt,
		},
	],
};

function postRequest(body: unknown, raw?: string) {
	return new Request("http://localhost:3000/api/mcq", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: raw ?? JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/mcq", () => {
	it("returns 200 and every question with its choice count", async () => {
		listQuestions.mockResolvedValue([SUMMARY]);

		const response = await GET();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ questions: [SUMMARY] });
	});

	it("returns 200 with an empty array for an empty bank, not a 404", async () => {
		listQuestions.mockResolvedValue([]);

		const response = await GET();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ questions: [] });
	});

	it("returns 500 when the service fails", async () => {
		listQuestions.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await GET();

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not load questions",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		listQuestions.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await GET();

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});
});

describe("POST /api/mcq", () => {
	it("returns 201 and the created question with its choices", async () => {
		createQuestion.mockResolvedValue(CREATED_QUESTION);

		const response = await POST(postRequest(VALID_BODY));

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			question: CREATED_QUESTION,
		});
	});

	it("passes the trimmed values through to the service", async () => {
		createQuestion.mockResolvedValue(CREATED_QUESTION);

		await POST(
			postRequest({
				...VALID_BODY,
				name: "  Capital of France  ",
				choices: [
					{ text: "  Paris  ", isCorrect: true },
					{ text: "Lyon", isCorrect: false },
				],
			}),
		);

		expect(createQuestion).toHaveBeenCalledTimes(1);
		const input = createQuestion.mock.calls[0][0];
		expect(input.name).toBe("Capital of France");
		expect(input.choices[0].text).toBe("Paris");
	});

	it("never forwards a client-supplied position to the service", async () => {
		createQuestion.mockResolvedValue(CREATED_QUESTION);

		await POST(
			postRequest({
				...VALID_BODY,
				choices: [
					{ text: "Paris", isCorrect: true, position: 5 },
					{ text: "Lyon", isCorrect: false, position: 4 },
				],
			}),
		);

		const input = createQuestion.mock.calls[0][0];
		expect(input.choices[0]).not.toHaveProperty("position");
	});

	it("returns 400 for a malformed JSON body", async () => {
		const response = await POST(postRequest(undefined, "{ not json"));

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Validation failed",
			fields: { body: "Expected a JSON object" },
		});
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 for an empty body naming every missing field", async () => {
		const response = await POST(postRequest({}));

		expect(response.status).toBe(400);
		const json = (await response.json()) as {
			error: string;
			fields: Record<string, string>;
		};
		expect(json.error).toBe("Validation failed");
		expect(Object.keys(json.fields).sort()).toEqual([
			"choices",
			"name",
			"questionText",
		]);
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it.each([
		["name", { ...VALID_BODY, name: "" }],
		["questionText", { ...VALID_BODY, questionText: "" }],
	])("returns 400 naming the invalid %s field", async (field, body) => {
		const response = await POST(postRequest(body));

		expect(response.status).toBe(400);
		const json = (await response.json()) as {
			error: string;
			fields: Record<string, string>;
		};
		expect(json.error).toBe("Validation failed");
		expect(json.fields[field]).toBeTypeOf("string");
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 with a readable message for a question with only one choice", async () => {
		const response = await POST(
			postRequest({
				...VALID_BODY,
				choices: [{ text: "Paris", isCorrect: true }],
			}),
		);

		expect(response.status).toBe(400);
		const json = (await response.json()) as {
			error: string;
			fields: Record<string, string>;
		};
		expect(json.error).toBe("Validation failed");
		expect(json.fields.choices).toBe("Add at least two choices");
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 with a readable message for two choices both marked correct", async () => {
		const response = await POST(
			postRequest({
				...VALID_BODY,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "Lyon", isCorrect: true },
				],
			}),
		);

		expect(response.status).toBe(400);
		const json = (await response.json()) as {
			error: string;
			fields: Record<string, string>;
		};
		expect(json.fields.choices).toBe(
			"Mark exactly one choice as the correct answer",
		);
		expect(createQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 when no choice is marked correct", async () => {
		const response = await POST(
			postRequest({
				...VALID_BODY,
				choices: [
					{ text: "Paris", isCorrect: false },
					{ text: "Lyon", isCorrect: false },
				],
			}),
		);

		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { fields: Record<string, string> }).fields
				.choices,
		).toBe("Mark exactly one choice as the correct answer");
	});

	it("returns 400 for more than six choices", async () => {
		const response = await POST(
			postRequest({
				...VALID_BODY,
				choices: Array.from({ length: 7 }, (_, index) => ({
					text: `Choice ${index}`,
					isCorrect: index === 0,
				})),
			}),
		);

		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { fields: Record<string, string> }).fields
				.choices,
		).toBe("A question can have at most six choices");
	});

	it("addresses a bad choice by its position in the list", async () => {
		const response = await POST(
			postRequest({
				...VALID_BODY,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "", isCorrect: false },
				],
			}),
		);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { fields: Record<string, string> };
		expect(json.fields["choices.1.text"]).toBe("Choice text is required");
	});

	it("returns 500 when the service fails unexpectedly", async () => {
		createQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(postRequest(VALID_BODY));

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not create question",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		createQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(postRequest(VALID_BODY));

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});

	it("does not log the request body when the service fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		createQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		await POST(postRequest(VALID_BODY));

		const logged = consoleError.mock.calls.flat().map(String).join(" ");
		expect(logged).not.toContain("Capital of France");
		expect(logged).not.toContain("Paris");
		consoleError.mockRestore();
	});
});
