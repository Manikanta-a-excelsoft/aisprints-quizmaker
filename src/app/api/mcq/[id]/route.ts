import {
	deleteQuestion,
	findQuestionById,
	toPublicQuestion,
	updateQuestion,
} from "@/lib/services/mcq-service";
import { pathErrors, questionInputSchema } from "@/lib/validation/mcq";

/** Route params are a promise in this version of Next, so every handler awaits them. */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
	request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;

	try {
		const question = await findQuestionById(id);
		if (!question) {
			return Response.json({ error: "Question not found" }, { status: 404 });
		}

		// The attempt page asks a question it is about to answer, so the answer is withheld
		// unless it is asked for. With no authentication anyone can ask, so this is tidiness
		// rather than a security boundary; the edit page is the caller that needs it.
		const includeAnswers =
			new URL(request.url).searchParams.get("include") === "answers";

		return Response.json({
			question: includeAnswers ? question : toPublicQuestion(question),
		});
	} catch (error) {
		console.error("Loading a question failed", error);

		return Response.json({ error: "Could not load question" }, { status: 500 });
	}
}

export async function PUT(
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

	// Validated before the id is used, so an invalid body is a 400 whether or not the
	// question exists. Reporting 404 for a malformed edit would be misleading.
	const parsed = questionInputSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Validation failed", fields: pathErrors(parsed.error) },
			{ status: 400 },
		);
	}

	try {
		const question = await updateQuestion(id, parsed.data);
		if (!question) {
			return Response.json({ error: "Question not found" }, { status: 404 });
		}

		// The full shape, answers included: the caller is the edit form, which needs to know
		// which choice was marked correct in order to show it.
		return Response.json({ question });
	} catch (error) {
		// Logged without the request body, so no question content reaches the logs.
		console.error("Updating a question failed", error);

		return Response.json({ error: "Could not update question" }, { status: 500 });
	}
}

export async function DELETE(
	_request: Request,
	{ params }: RouteContext,
): Promise<Response> {
	const { id } = await params;

	try {
		// The service reports whether a row was actually removed, which is what separates a
		// real delete from a missing id. Choices and attempts go with it via the cascade.
		const deleted = await deleteQuestion(id);
		if (!deleted) {
			return Response.json({ error: "Question not found" }, { status: 404 });
		}

		return Response.json({ success: true });
	} catch (error) {
		console.error("Deleting a question failed", error);

		return Response.json({ error: "Could not delete question" }, { status: 500 });
	}
}
