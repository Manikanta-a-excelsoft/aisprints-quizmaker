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
 * What the register form validates: every API rule, plus a confirmation field.
 *
 * The confirmation is a typing check for the person filling in the form, so it stays in the
 * browser. `registerSchema` above is what the route enforces, and it has no
 * `confirmPassword`, so the form must post only the fields that schema knows about.
 */
export const registerFormSchema = registerSchema
	.extend({
		confirmPassword: z.string().min(1, "Please confirm your password"),
	})
	.refine((values) => values.password === values.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
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
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
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
