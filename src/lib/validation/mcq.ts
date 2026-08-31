import { z } from "zod";

/**
 * Shared so the Phase 4 form enforces exactly the rules the routes enforce, rather than
 * drifting from them. Follows `auth.ts`: schemas plus a flattener, and the same
 * `{ error, fields }` response envelope.
 */
export const choiceInputSchema = z.object({
	// The message is repeated on the type and on the length check on purpose. A field that
	// arrives missing is a different Zod issue from one that arrives empty, and both mean the
	// same thing to the person filling in the form.
	text: z
		.string({ error: "Choice text is required" })
		.trim()
		.min(1, "Choice text is required")
		.max(500, "A choice must be at most 500 characters"),
	isCorrect: z.boolean({ error: "Mark whether this choice is the correct answer" }),
});

/**
 * "Exactly one correct choice" cannot be a database constraint, because it is a property of
 * a set of rows rather than of one row. It is enforced here and nowhere else, so this
 * schema is the only thing standing between the bank and an unanswerable question.
 *
 * Neither `position` nor a choice `id` is accepted. Position is the array order, and editing
 * replaces the whole choice set, so an id would carry no meaning. Zod strips both silently
 * rather than failing a client that sends them.
 */
export const questionInputSchema = z.object({
	name: z
		.string({ error: "Name is required" })
		.trim()
		.min(1, "Name is required")
		.max(100, "Name must be at most 100 characters"),
	questionText: z
		.string({ error: "Question text is required" })
		.trim()
		.min(1, "Question text is required")
		.max(1000, "Question text must be at most 1000 characters"),
	choices: z
		.array(choiceInputSchema, { error: "Add at least two choices" })
		.min(2, "Add at least two choices")
		.max(6, "A question can have at most six choices")
		.refine(
			(choices) => choices.filter((choice) => choice.isCorrect).length === 1,
			{ message: "Mark exactly one choice as the correct answer" },
		),
});

/**
 * An attempt carries only the chosen id. Correctness is read from the database by the
 * service, so there is deliberately nothing here for a client to assert about it.
 */
export const attemptInputSchema = z.object({
	choiceId: z
		.string({ error: "Select an answer" })
		.trim()
		.min(1, "Select an answer"),
});

export type ChoiceInput = z.infer<typeof choiceInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type AttemptInput = z.infer<typeof attemptInputSchema>;

/**
 * Like `fieldErrors()` in `auth.ts`, but keeps the whole path so nested choice errors stay
 * addressable. `auth.ts` keys on `path[0]`, which is right for a flat form and wrong here:
 * two different broken choices would both land on `choices` and the form could not mark the
 * offending row. This produces `choices.1.text`, while array-level messages — too few, too
 * many, not exactly one correct — still arrive under plain `choices`.
 *
 * An issue with no path at all means the body itself was the wrong shape, so it is reported
 * under `body`, matching the key the malformed-JSON branch uses.
 */
export function pathErrors(error: z.ZodError): Record<string, string> {
	const fields: Record<string, string> = {};

	for (const issue of error.issues) {
		const key = issue.path.length === 0 ? "body" : issue.path.join(".");
		if (!(key in fields)) {
			fields[key] = issue.message;
		}
	}

	return fields;
}
