import { describe, expect, it } from "vitest";

import { fieldErrors } from "./auth";
import {
	attemptInputSchema,
	choiceInputSchema,
	pathErrors,
	questionInputSchema,
} from "./mcq";

const VALID_QUESTION = {
	name: "Capital of France",
	questionText: "Which city is the capital of France?",
	choices: [
		{ text: "Paris", isCorrect: true },
		{ text: "Lyon", isCorrect: false },
	],
};

/** Builds a choice list of the given length with exactly one correct answer. */
function choices(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		text: `Choice ${index + 1}`,
		isCorrect: index === 0,
	}));
}

function errorsFor(input: unknown): Record<string, string> {
	const parsed = questionInputSchema.safeParse(input);
	if (parsed.success) {
		throw new Error("Expected the input to fail validation, but it passed");
	}

	return pathErrors(parsed.error);
}

describe("questionInputSchema", () => {
	it("accepts a well-formed question", () => {
		const parsed = questionInputSchema.safeParse(VALID_QUESTION);

		expect(parsed.success).toBe(true);
	});

	it("accepts anywhere from two to six choices", () => {
		for (const count of [2, 3, 4, 5, 6]) {
			const parsed = questionInputSchema.safeParse({
				...VALID_QUESTION,
				choices: choices(count),
			});

			expect(parsed.success).toBe(true);
		}
	});

	it("trims the values it returns, so no leading whitespace is stored", () => {
		const parsed = questionInputSchema.safeParse({
			name: "  Capital of France  ",
			questionText: "  Which city?  ",
			choices: [
				{ text: "  Paris  ", isCorrect: true },
				{ text: "  Lyon  ", isCorrect: false },
			],
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;

		expect(parsed.data.name).toBe("Capital of France");
		expect(parsed.data.questionText).toBe("Which city?");
		expect(parsed.data.choices.map((choice) => choice.text)).toEqual([
			"Paris",
			"Lyon",
		]);
	});

	it("requires a name", () => {
		expect(errorsFor({ ...VALID_QUESTION, name: "" }).name).toBe(
			"Name is required",
		);
	});

	it("treats a name of only whitespace as missing", () => {
		expect(errorsFor({ ...VALID_QUESTION, name: "   " }).name).toBe(
			"Name is required",
		);
	});

	it("caps the name at 100 characters", () => {
		expect(
			questionInputSchema.safeParse({
				...VALID_QUESTION,
				name: "a".repeat(100),
			}).success,
		).toBe(true);
		expect(errorsFor({ ...VALID_QUESTION, name: "a".repeat(101) }).name).toBe(
			"Name must be at most 100 characters",
		);
	});

	it("requires question text", () => {
		expect(errorsFor({ ...VALID_QUESTION, questionText: "" }).questionText).toBe(
			"Question text is required",
		);
	});

	it("caps the question text at 1000 characters", () => {
		expect(
			questionInputSchema.safeParse({
				...VALID_QUESTION,
				questionText: "a".repeat(1000),
			}).success,
		).toBe(true);
		expect(
			errorsFor({ ...VALID_QUESTION, questionText: "a".repeat(1001) })
				.questionText,
		).toBe("Question text must be at most 1000 characters");
	});

	it("requires at least two choices", () => {
		expect(errorsFor({ ...VALID_QUESTION, choices: choices(1) }).choices).toBe(
			"Add at least two choices",
		);
	});

	it("rejects an empty choice list", () => {
		expect(errorsFor({ ...VALID_QUESTION, choices: [] }).choices).toBe(
			"Add at least two choices",
		);
	});

	it("allows at most six choices", () => {
		expect(errorsFor({ ...VALID_QUESTION, choices: choices(7) }).choices).toBe(
			"A question can have at most six choices",
		);
	});

	it("requires exactly one correct choice, rejecting none", () => {
		expect(
			errorsFor({
				...VALID_QUESTION,
				choices: [
					{ text: "Paris", isCorrect: false },
					{ text: "Lyon", isCorrect: false },
				],
			}).choices,
		).toBe("Mark exactly one choice as the correct answer");
	});

	it("requires exactly one correct choice, rejecting two", () => {
		expect(
			errorsFor({
				...VALID_QUESTION,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "Lyon", isCorrect: true },
				],
			}).choices,
		).toBe("Mark exactly one choice as the correct answer");
	});

	it("requires each choice to have text", () => {
		expect(
			errorsFor({
				...VALID_QUESTION,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "", isCorrect: false },
				],
			})["choices.1.text"],
		).toBe("Choice text is required");
	});

	it("caps a choice at 500 characters", () => {
		expect(
			errorsFor({
				...VALID_QUESTION,
				choices: [
					{ text: "Paris", isCorrect: true },
					{ text: "a".repeat(501), isCorrect: false },
				],
			})["choices.1.text"],
		).toBe("A choice must be at most 500 characters");
	});

	it("requires isCorrect on every choice", () => {
		const errors = errorsFor({
			...VALID_QUESTION,
			choices: [{ text: "Paris" }, { text: "Lyon", isCorrect: false }],
		});

		expect(errors["choices.0.isCorrect"]).toBeTypeOf("string");
	});

	it("names every missing field at once when the body is empty", () => {
		const errors = errorsFor({});

		expect(Object.keys(errors).sort()).toEqual([
			"choices",
			"name",
			"questionText",
		]);
	});

	it("ignores a client-supplied position instead of rejecting it", () => {
		const parsed = questionInputSchema.safeParse({
			...VALID_QUESTION,
			choices: [
				{ text: "Paris", isCorrect: true, position: 5 },
				{ text: "Lyon", isCorrect: false, position: 0 },
			],
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;

		expect(parsed.data.choices[0]).not.toHaveProperty("position");
	});

	/**
	 * Editing replaces the whole choice set, so a choice id carries no meaning. Dropping it
	 * silently keeps an older client working rather than failing it.
	 */
	it("ignores a client-supplied choice id, since editing replaces the choice set", () => {
		const parsed = questionInputSchema.safeParse({
			...VALID_QUESTION,
			choices: [
				{ id: "1a4b", text: "Paris", isCorrect: true },
				{ text: "Lyon", isCorrect: false },
			],
		});

		expect(parsed.success).toBe(true);
		if (!parsed.success) return;

		expect(parsed.data.choices[0]).not.toHaveProperty("id");
	});

	it("rejects choices that are not an array", () => {
		expect(errorsFor({ ...VALID_QUESTION, choices: "Paris" }).choices).toBeTypeOf(
			"string",
		);
	});

	it("gives every message in plain language, with no Zod wording", () => {
		const errors = errorsFor({ name: "", questionText: "", choices: choices(1) });

		for (const message of Object.values(errors)) {
			expect(message).not.toMatch(/expected|received|invalid_type|ZodError/i);
			expect(message[0]).toBe(message[0].toUpperCase());
		}
	});
});

describe("choiceInputSchema", () => {
	it("accepts a choice with text and a correct flag", () => {
		expect(
			choiceInputSchema.safeParse({ text: "Paris", isCorrect: true }).success,
		).toBe(true);
	});

	it("treats a choice of only whitespace as missing", () => {
		const parsed = choiceInputSchema.safeParse({ text: "   ", isCorrect: false });

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(pathErrors(parsed.error).text).toBe("Choice text is required");
	});
});

describe("attemptInputSchema", () => {
	it("accepts a choice id", () => {
		expect(attemptInputSchema.safeParse({ choiceId: "1a4b" }).success).toBe(true);
	});

	it("requires a choice id, so submitting nothing is a validation error", () => {
		const parsed = attemptInputSchema.safeParse({});

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(pathErrors(parsed.error).choiceId).toBe("Select an answer");
	});

	it("treats a blank choice id as no answer", () => {
		const parsed = attemptInputSchema.safeParse({ choiceId: "   " });

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(pathErrors(parsed.error).choiceId).toBe("Select an answer");
	});
});

describe("pathErrors", () => {
	it("keys a nested choice error by its full path", () => {
		const errors = errorsFor({
			...VALID_QUESTION,
			choices: [
				{ text: "Paris", isCorrect: true },
				{ text: "", isCorrect: false },
				{ text: "", isCorrect: false },
			],
		});

		expect(errors).toHaveProperty("choices.1.text");
		expect(errors).toHaveProperty("choices.2.text");
	});

	it("keeps array-level messages on the plain choices key", () => {
		expect(errorsFor({ ...VALID_QUESTION, choices: choices(7) })).toHaveProperty(
			"choices",
		);
	});

	it("keeps the first message per field rather than the last", () => {
		const errors = errorsFor({ ...VALID_QUESTION, name: "" });

		expect(errors.name).toBe("Name is required");
	});

	/**
	 * The reason this function exists rather than reusing fieldErrors(): auth's version keys
	 * on path[0], so two different broken choices would collapse onto one "choices" key and
	 * the form could not mark the right row.
	 */
	it("distinguishes two broken choices where fieldErrors would collapse them", () => {
		const parsed = questionInputSchema.safeParse({
			...VALID_QUESTION,
			choices: [
				{ text: "", isCorrect: true },
				{ text: "", isCorrect: false },
			],
		});

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(Object.keys(pathErrors(parsed.error))).toEqual([
			"choices.0.text",
			"choices.1.text",
		]);
		expect(Object.keys(fieldErrors(parsed.error))).toEqual(["choices"]);
	});

	it("returns an object of plain strings, matching the auth error envelope", () => {
		const errors = errorsFor({});

		for (const [key, message] of Object.entries(errors)) {
			expect(key).toBeTypeOf("string");
			expect(message).toBeTypeOf("string");
		}
	});
});
