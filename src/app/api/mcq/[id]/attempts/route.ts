import {
	ChoiceNotInQuestionError,
	recordAttempt,
} from "@/lib/services/mcq-service";
import { attemptInputSchema, pathErrors } from "@/lib/validation/mcq";

/** Route params are a promise in this version of Next, so the handler awaits them. */
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json(
			{
				error: "Validation failed",
				fields: { body: "Expected a JSON object" },
			},
			{ status: 400 },
		);
	}

	const parsed = attemptInputSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Validation failed", fields: pathErrors(parsed.error) },
			{ status: 400 },
		);
	}

	try {
		// Only ids are passed on. Whether the answer was right is read from the stored choice
		// by the service, so nothing the client sends can decide it. userId stays unset
		// because there is no session to read it from.
		const result = await recordAttempt(id, parsed.data.choiceId);
		if (!result) {
			return Response.json({ error: "Question not found" }, { status: 404 });
		}

		return Response.json(result, { status: 201 });
	} catch (error) {
		// A choice from another question is the caller's mistake, not a server fault, so it
		// is a 400 with the reason rather than a 500.
		if (error instanceof ChoiceNotInQuestionError) {
			return Response.json({ error: error.message }, { status: 400 });
		}

		console.error("Recording an attempt failed", error);

		return Response.json({ error: "Could not record attempt" }, { status: 500 });
	}
}
