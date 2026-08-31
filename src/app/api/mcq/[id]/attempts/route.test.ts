import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChoiceNotInQuestionError } from "@/lib/services/mcq-service";

import { POST } from "./route";

const { recordAttempt } = vi.hoisted(() => ({ recordAttempt: vi.fn() }));

// Guarantees no test can reach a real database even by accident.
vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(() => {
		throw new Error("A route test must not reach Cloudflare bindings");
	}),
}));

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return { ...actual, recordAttempt };
});

const ID = "9f2c1d3e4f5a6b7c8d9e0f1a2b3c4d5e";
const CHOICE_ID = "1a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d";

const CORRECT_RESULT = {
	attempt: {
		id: "7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
		questionId: ID,
		userId: null,
		choiceId: CHOICE_ID,
		isCorrect: true,
		createdAt: "2026-08-31 14:09:44",
	},
	correctChoiceId: CHOICE_ID,
};

/** Next passes route params as a promise, so tests hand the handler the same shape. */
function context(id: string = ID) {
	return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown, raw?: string) {
	return new Request(`http://localhost:3000/api/mcq/${ID}/attempts`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: raw ?? JSON.stringify(body),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/mcq/[id]/attempts", () => {
	it("returns 201 with the recorded attempt and the correct choice", async () => {
		recordAttempt.mockResolvedValue(CORRECT_RESULT);

		const response = await POST(postRequest({ choiceId: CHOICE_ID }), context());

		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual(CORRECT_RESULT);
	});

	it("reports an incorrect answer while still naming the right one", async () => {
		recordAttempt.mockResolvedValue({
			attempt: { ...CORRECT_RESULT.attempt, choiceId: "wrong", isCorrect: false },
			correctChoiceId: CHOICE_ID,
		});

		const response = await POST(postRequest({ choiceId: "wrong" }), context());

		expect(response.status).toBe(201);
		const json = (await response.json()) as {
			attempt: { isCorrect: boolean };
			correctChoiceId: string;
		};
		expect(json.attempt.isCorrect).toBe(false);
		expect(json.correctChoiceId).toBe(CHOICE_ID);
	});

	it("passes the question id from the path and the choice id from the body", async () => {
		recordAttempt.mockResolvedValue(CORRECT_RESULT);

		await POST(postRequest({ choiceId: CHOICE_ID }), context());

		expect(recordAttempt).toHaveBeenCalledWith(ID, CHOICE_ID);
	});

	/**
	 * The service decides correctness by reading the database. Anything the client sends
	 * about correctness has to be ignored, or the feature could be answered from the browser.
	 */
	it("ignores an isCorrect the client tries to send", async () => {
		recordAttempt.mockResolvedValue({
			...CORRECT_RESULT,
			attempt: { ...CORRECT_RESULT.attempt, isCorrect: false },
		});

		const response = await POST(
			postRequest({ choiceId: CHOICE_ID, isCorrect: true }),
			context(),
		);

		expect(recordAttempt).toHaveBeenCalledWith(ID, CHOICE_ID);
		expect(
			((await response.json()) as { attempt: { isCorrect: boolean } }).attempt
				.isCorrect,
		).toBe(false);
	});

	it("never lets the client set the userId", async () => {
		recordAttempt.mockResolvedValue(CORRECT_RESULT);

		await POST(
			postRequest({ choiceId: CHOICE_ID, userId: "someone-else" }),
			context(),
		);

		expect(recordAttempt).toHaveBeenCalledWith(ID, CHOICE_ID);
	});

	it("returns 400 for a malformed JSON body", async () => {
		const response = await POST(postRequest(undefined, "{ not json"), context());

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Validation failed",
			fields: { body: "Expected a JSON object" },
		});
		expect(recordAttempt).not.toHaveBeenCalled();
	});

	it("returns 400 with a readable message when no choice was selected", async () => {
		const response = await POST(postRequest({}), context());

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Validation failed",
			fields: { choiceId: "Select an answer" },
		});
		expect(recordAttempt).not.toHaveBeenCalled();
	});

	it("returns 400 when the choice id is blank", async () => {
		const response = await POST(postRequest({ choiceId: "   " }), context());

		expect(response.status).toBe(400);
		expect(
			((await response.json()) as { fields: Record<string, string> }).fields
				.choiceId,
		).toBe("Select an answer");
	});

	it("returns 400 when the choice belongs to another question", async () => {
		recordAttempt.mockRejectedValue(new ChoiceNotInQuestionError());

		const response = await POST(
			postRequest({ choiceId: "a-choice-from-elsewhere" }),
			context(),
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "That choice does not belong to this question",
		});
	});

	it("returns 404 when the question does not exist", async () => {
		recordAttempt.mockResolvedValue(null);

		const response = await POST(
			postRequest({ choiceId: CHOICE_ID }),
			context("missing-id"),
		);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});

	it("returns 500 when the service fails unexpectedly", async () => {
		recordAttempt.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(postRequest({ choiceId: CHOICE_ID }), context());

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "Could not record attempt",
		});
	});

	it("does not leak the underlying error message to the client", async () => {
		recordAttempt.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		const response = await POST(postRequest({ choiceId: CHOICE_ID }), context());

		expect(JSON.stringify(await response.json())).not.toContain("D1_ERROR");
	});

	it("does not log the request body when the service fails", async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		recordAttempt.mockRejectedValue(new Error("D1_ERROR: database is locked"));

		await POST(postRequest({ choiceId: CHOICE_ID }), context());

		const logged = consoleError.mock.calls.flat().map(String).join(" ");
		expect(logged).not.toContain(CHOICE_ID);
		consoleError.mockRestore();
	});
});
