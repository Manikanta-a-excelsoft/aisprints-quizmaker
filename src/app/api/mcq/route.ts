import { createQuestion, listQuestions } from "@/lib/services/mcq-service";
import { pathErrors, questionInputSchema } from "@/lib/validation/mcq";

export async function GET(): Promise<Response> {
	try {
		const questions = await listQuestions();

		// An empty bank is a 200 with an empty array. The UI's empty state reads that array;
		// a 404 here would make "nothing yet" indistinguishable from a broken route.
		return Response.json({ questions });
	} catch (error) {
		console.error("Listing questions failed", error);

		return Response.json({ error: "Could not load questions" }, { status: 500 });
	}
}

export async function POST(request: Request): Promise<Response> {
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

	const parsed = questionInputSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Validation failed", fields: pathErrors(parsed.error) },
			{ status: 400 },
		);
	}

	try {
		const question = await createQuestion(parsed.data);

		return Response.json({ question }, { status: 201 });
	} catch (error) {
		// Logged without the request body, so no question content reaches the logs.
		console.error("Creating a question failed", error);

		return Response.json({ error: "Could not create question" }, { status: 500 });
	}
}
