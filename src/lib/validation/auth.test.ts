import { describe, expect, it } from "vitest";

import { fieldErrors, registerFormSchema, registerSchema } from "./auth";

const VALID = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@example.com",
	password: "correct horse battery",
	confirmPassword: "correct horse battery",
};

describe("registerFormSchema", () => {
	it("accepts input whose two passwords match", () => {
		const parsed = registerFormSchema.safeParse(VALID);

		expect(parsed.success).toBe(true);
	});

	it("rejects input whose passwords differ", () => {
		const parsed = registerFormSchema.safeParse({
			...VALID,
			confirmPassword: "correct horse batteryy",
		});

		expect(parsed.success).toBe(false);
	});

	it("reports a mismatch against the confirmation field, not the password field", () => {
		const parsed = registerFormSchema.safeParse({
			...VALID,
			confirmPassword: "something else",
		});

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(fieldErrors(parsed.error)).toEqual({
			confirmPassword: "Passwords do not match",
		});
	});

	it("requires the confirmation field to be filled in", () => {
		const parsed = registerFormSchema.safeParse({ ...VALID, confirmPassword: "" });

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		expect(fieldErrors(parsed.error).confirmPassword).toBe(
			"Please confirm your password",
		);
	});

	it("still enforces every rule the API enforces", () => {
		const parsed = registerFormSchema.safeParse({
			...VALID,
			username: "ab",
			email: "not-an-email",
			password: "short",
			confirmPassword: "short",
		});

		expect(parsed.success).toBe(false);
		if (parsed.success) return;

		const fields = fieldErrors(parsed.error);
		expect(fields.username).toBe("Username must be at least 3 characters");
		expect(fields.email).toBe("Must be a valid email address");
		expect(fields.password).toBe("Password must be at least 8 characters");
	});

	it("compares the passwords exactly, without trimming", () => {
		const parsed = registerFormSchema.safeParse({
			...VALID,
			confirmPassword: `${VALID.confirmPassword} `,
		});

		expect(parsed.success).toBe(false);
	});
});

describe("registerSchema", () => {
	it("does not require a confirmation field, since the API never receives one", () => {
		const { confirmPassword, ...apiPayload } = VALID;
		void confirmPassword;

		expect(registerSchema.safeParse(apiPayload).success).toBe(true);
	});
});
