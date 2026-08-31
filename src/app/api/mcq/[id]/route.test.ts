import { beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, PUT } from "./route";

const { deleteQuestion, findQuestionById, updateQuestion } = vi.hoisted(() => ({
	deleteQuestion: vi.fn(),
	findQuestionById: vi.fn(),
	updateQuestion: vi.fn(),
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
	return { ...actual, deleteQuestion, findQuestionById, updateQuestion };
});

const ID = "9f2c1d3e4f5a6b7c8d9e0f1a2b3c4d5e";

const QUESTION = {
	id: ID,
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	createdBy: null,
	createdAt: "2026-08-31 14:02:11",
	updatedAt: "2026-08-31 14:02:11",
	choices: [
		{
			id: "1a4b",
			questionId: ID,
			text: "Paris",
			isCorrect: true,
			position: 0,
			createdAt: "2026-08-31 14:02:11",
		},
		{
			id: "2b5c",
			questionId: ID,
			text: "Lyon",
			isCorrect: false,
			position: 1,
			createdAt: "2026-08-31 14:02:11",
		},
	],
};

const VALID_BODY = {
	name: "Capital city",
	questionText: "What is the capital of France?",
	choices: [
		{ text: "Paris", isCorrect: true },
		{ text: "Nice", isCorrect: false },
	],
};

/** Next passes route params as a promise, so tests hand the handler the same shape. */
function context(id: string = ID) {
	return { params: Promise.resolve({ id }) };
}

function getRequest(query = "") {
	return new Request(`http://localhost:3000/api/mcq/${ID}${query}`);
}

function putRequest(body: unknown, raw?: string) {
	return new Request(`http://localhost:3000/api/mcq/${ID}`, {
		method: "PUT",
		headers: { "content-type": "application/json" },
		body: raw ?? JSON.stringify(body),
	});
}

function deleteRequest() {
	return new Request(`http://localhost:3000/api/mcq/${ID}`, {
		method: "DELETE",
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/mcq/[id]", () => {
	it("returns 200 and the question with its choices", async () => {
		findQuestionById.mockResolvedValue(QUESTION);

		const response = await GET(getRequest(), context());

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			question: { id: string; choices: unknown[] };
		};
		expect(json.question.id).toBe(ID);
		expect(json.question.choices).toHaveLength(2);
	});

	it("hides which choice is correct by default", async () => {
		findQuestionById.mockResolvedValue(QUESTION);

		const response = await GET(getRequest(), context());

		const body = JSON.stringify(await response.json());
		expect(body).not.toContain("isCorrect");
	});

	it("includes isCorrect when asked for it explicitly", async () => {
		findQuestionById.mockResolvedValue(QUESTION);

		const response = await GET(getRequest("?include=answers"), context());

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			question: { choices: { text: string; isCorrect: boolean }[] };
		};
		expect(json.question.choices[0].isCorrect).toBe(true);
		expect(json.question.choices[1].isCorrect).toBe(false);
	});

	it("ignores an include value it does not recognise", async () => {
		findQuestionById.mockResolvedValue(QUESTION);

		const response = await GET(getRequest("?include=everything"), context());

		expect(JSON.stringify(await response.json())).not.toContain("isCorrect");
	});

	it("looks the question up by the id in the path", async () => {
		findQuestionById.mockResolvedValue(QUESTION);

		await GET(getRequest(), context("some-other-id"));

		expect(findQuestionById).toHaveBeenCalledWith("some-other-id");
	});

	it("returns 404 for a question id that does not exist", async () => {
		findQuestionById.mockResolvedValue(null);

		const response = await GET(getRequest(), context("missing-id"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});

	it("returns 500 when the service fails", async () => {
		findQuestionById.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await GET(getRequest(), context());

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not load question",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		findQuestionById.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await GET(getRequest(), context());

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});
});

describe("PUT /api/mcq/[id]", () => {
	it("returns 200 and the updated question, answers included", async () => {
		updateQuestion.mockResolvedValue({ ...QUESTION, name: "Capital city" });

		const response = await PUT(putRequest(VALID_BODY), context());

		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			question: { name: string; choices: { isCorrect: boolean }[] };
		};
		expect(json.question.name).toBe("Capital city");
		expect(json.question.choices[0].isCorrect).toBe(true);
	});

	it("passes the id from the path and the validated body to the service", async () => {
		updateQuestion.mockResolvedValue(QUESTION);

		await PUT(putRequest(VALID_BODY), context());

		expect(updateQuestion).toHaveBeenCalledTimes(1);
		const [id, input] = updateQuestion.mock.calls[0];
		expect(id).toBe(ID);
		expect(input).toEqual(VALID_BODY);
	});

	it("returns 400 for a malformed JSON body", async () => {
		const response = await PUT(putRequest(undefined, "{ not json"), context());

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Validation failed",
			fields: { body: "Expected a JSON object" },
		});
		expect(updateQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 for an empty body naming every missing field", async () => {
		const response = await PUT(putRequest({}), context());

		expect(response.status).toBe(400);
		const json = (await response.json()) as { fields: Record<string, string> };
		expect(Object.keys(json.fields).sort()).toEqual([
			"choices",
			"name",
			"questionText",
		]);
		expect(updateQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 for a question left with only one choice", async () => {
		const response = await PUT(
			putRequest({ ...VALID_BODY, choices: [{ text: "Paris", isCorrect: true }] }),
			context(),
		);

		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { fields: Record<string, string> }).fields
				.choices,
		).toBe("Add at least two choices");
		expect(updateQuestion).not.toHaveBeenCalled();
	});

	it("returns 400 for two choices both marked correct", async () => {
		const response = await PUT(
			putRequest({
				...VALID_BODY,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "Nice", isCorrect: true },
				],
			}),
			context(),
		);

		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { fields: Record<string, string> }).fields
				.choices,
		).toBe("Mark exactly one choice as the correct answer");
		expect(updateQuestion).not.toHaveBeenCalled();
	});

	it("validates before it looks the question up, so a bad body is never a 404", async () => {
		updateQuestion.mockResolvedValue(null);

		const response = await PUT(putRequest({}), context("missing-id"));

		expect(response.status).toBe(400);
		expect(updateQuestion).not.toHaveBeenCalled();
	});

	it("returns 404 when the question does not exist", async () => {
		updateQuestion.mockResolvedValue(null);

		const response = await PUT(putRequest(VALID_BODY), context("missing-id"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});

	it("returns 500 when the service fails unexpectedly", async () => {
		updateQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await PUT(putRequest(VALID_BODY), context());

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not update question",
		});
	});

	it("does not log the request body when the service fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		updateQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		await PUT(putRequest(VALID_BODY), context());

		const logged = consoleError.mock.calls.flat().map(String).join(" ");
		expect(logged).not.toContain("Capital city");
		expect(logged).not.toContain("Nice");
		consoleError.mockRestore();
	});
});

describe("DELETE /api/mcq/[id]", () => {
	it("returns 200 when the question was deleted", async () => {
		deleteQuestion.mockResolvedValue(true);

		const response = await DELETE(deleteRequest(), context());

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ success: true });
	});

	it("deletes by the id in the path", async () => {
		deleteQuestion.mockResolvedValue(true);

		await DELETE(deleteRequest(), context("some-other-id"));

		expect(deleteQuestion).toHaveBeenCalledWith("some-other-id");
	});

	it("returns 404 when no question matched", async () => {
		deleteQuestion.mockResolvedValue(false);

		const response = await DELETE(deleteRequest(), context("missing-id"));

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});

	it("returns 500 when the service fails", async () => {
		deleteQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await DELETE(deleteRequest(), context());

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not delete question",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		deleteQuestion.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await DELETE(deleteRequest(), context());

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});
});
