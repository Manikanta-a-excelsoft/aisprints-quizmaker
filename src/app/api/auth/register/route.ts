import { hashPassword } from "@/lib/password";
import {
	DuplicateUserError,
	createUser,
	toPublicUser,
} from "@/lib/services/user-service";
import { fieldErrors, registerSchema } from "@/lib/validation/auth";

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

	const parsed = registerSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Validation failed", fields: fieldErrors(parsed.error) },
			{ status: 400 },
		);
	}

	const { firstName, lastName, username, email, password } = parsed.data;

	try {
		const user = await createUser({
			firstName,
			lastName,
			username,
			email,
			passwordHash: await hashPassword(password),
		});

		return Response.json({ user: toPublicUser(user) }, { status: 201 });
	} catch (error) {
		if (error instanceof DuplicateUserError) {
			return Response.json(
				{
					error:
						error.field === "username"
							? "Username already taken"
							: "Email already registered",
				},
				{ status: 400 },
			);
		}

		// Logged without the request body so no password reaches the logs.
		console.error("Registration failed", error);

		return Response.json({ error: "Could not create account" }, { status: 500 });
	}
}
