import { z } from "zod";

/**
 * Shared so the Phase 4 forms can mirror exactly the rules the routes enforce, rather
 * than drifting from them.
 */
export const registerSchema = z.object({
	firstName: z.string().trim().min(1, "First name is required"),
	lastName: z.string().trim().min(1, "Last name is required"),
	username: z
		.string()
		.trim()
		.min(3, "Username must be at least 3 characters")
		.max(32, "Username must be at most 32 characters"),
	email: z.email("Must be a valid email address"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Login deliberately only checks that something was supplied. Applying the registration
 * password rules here would tell an attacker what those rules are, and would reject
 * existing accounts if the rules ever change.
 */
export const loginSchema = z.object({
	username: z.string().trim().min(1, "Username is required"),
	password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Flattens Zod issues into one message per field, keeping the first per field. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
	const fields: Record<string, string> = {};

	for (const issue of error.issues) {
		const key = issue.path[0];
		if (typeof key === "string" && !(key in fields)) {
			fields[key] = issue.message;
		}
	}

	return fields;
}
