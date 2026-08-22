import { verifyPasswordPlaceholder } from "@/lib/password-placeholder";
import { findUserByUsername, toPublicUser } from "@/lib/services/user-service";
import { fieldErrors, loginSchema } from "@/lib/validation/auth";

/**
 * One message for every credential failure, so the endpoint cannot be used to discover
 * which usernames exist.
 */
const INVALID_CREDENTIALS = "Invalid credentials";

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

	const parsed = loginSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Validation failed", fields: fieldErrors(parsed.error) },
			{ status: 400 },
		);
	}

	const { username, password } = parsed.data;

	try {
		const user = await findUserByUsername(username);

		if (!user) {
			return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		const passwordMatches = await verifyPasswordPlaceholder(
			password,
			user.passwordHash,
		);

		if (!passwordMatches) {
			return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		// No cookie and no token: this sprint has no session management by design.
		return Response.json({ user: toPublicUser(user) }, { status: 200 });
	} catch (error) {
		console.error("Login failed", error);

		return Response.json({ error: "Could not sign in" }, { status: 500 });
	}
}
