"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { postAuth } from "@/lib/auth-client";
import { fieldErrors, registerFormSchema } from "@/lib/validation/auth";

const EMPTY = {
	firstName: "",
	lastName: "",
	username: "",
	email: "",
	password: "",
	confirmPassword: "",
};

export function RegisterForm() {
	const router = useRouter();
	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	function update(field: keyof typeof values, value: string) {
		setValues((current) => ({ ...current, [field]: value }));
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		// The route's own schema plus the confirmation check, so the two cannot disagree
		// about the fields they share.
		const parsed = registerFormSchema.safeParse(values);
		if (!parsed.success) {
			setErrors(fieldErrors(parsed.error));
			return;
		}

		setErrors({});
		setPending(true);

		// confirmPassword is left behind deliberately: the API has no such field.
		const { firstName, lastName, username, email, password } = parsed.data;
		const result = await postAuth("/api/auth/register", {
			firstName,
			lastName,
			username,
			email,
			password,
		});
		if (result.ok) {
			router.push("/mcq");
			return;
		}

		setErrors(result.fields);
		setFormError(result.message);
		setPending(false);
	}

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>
					<h1>Create your account</h1>
				</CardTitle>
				<CardDescription>
					All fields are required. You will sign in with your username.
				</CardDescription>
			</CardHeader>

			<CardContent>
				<form onSubmit={handleSubmit} noValidate>
					<FieldGroup>
						{formError && (
							<div
								role="alert"
								className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
							>
								{formError}
							</div>
						)}

						<Field data-invalid={Boolean(errors.firstName)}>
							<FieldLabel htmlFor="firstName">First name</FieldLabel>
							<Input
								id="firstName"
								name="firstName"
								autoComplete="given-name"
								value={values.firstName}
								onChange={(event) => update("firstName", event.target.value)}
								aria-invalid={Boolean(errors.firstName)}
								aria-describedby={errors.firstName ? "firstName-error" : undefined}
							/>
							<FieldError
								id="firstName-error"
								errors={errors.firstName ? [{ message: errors.firstName }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.lastName)}>
							<FieldLabel htmlFor="lastName">Last name</FieldLabel>
							<Input
								id="lastName"
								name="lastName"
								autoComplete="family-name"
								value={values.lastName}
								onChange={(event) => update("lastName", event.target.value)}
								aria-invalid={Boolean(errors.lastName)}
								aria-describedby={errors.lastName ? "lastName-error" : undefined}
							/>
							<FieldError
								id="lastName-error"
								errors={errors.lastName ? [{ message: errors.lastName }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.username)}>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input
								id="username"
								name="username"
								autoComplete="username"
								value={values.username}
								onChange={(event) => update("username", event.target.value)}
								aria-invalid={Boolean(errors.username)}
								aria-describedby={errors.username ? "username-error" : undefined}
							/>
							<FieldDescription>3 to 32 characters.</FieldDescription>
							<FieldError
								id="username-error"
								errors={errors.username ? [{ message: errors.username }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.email)}>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								name="email"
								type="email"
								autoComplete="email"
								value={values.email}
								onChange={(event) => update("email", event.target.value)}
								aria-invalid={Boolean(errors.email)}
								aria-describedby={errors.email ? "email-error" : undefined}
							/>
							<FieldError
								id="email-error"
								errors={errors.email ? [{ message: errors.email }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.password)}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="new-password"
								value={values.password}
								onChange={(event) => update("password", event.target.value)}
								aria-invalid={Boolean(errors.password)}
								aria-describedby={errors.password ? "password-error" : undefined}
							/>
							<FieldDescription>At least 8 characters.</FieldDescription>
							<FieldError
								id="password-error"
								errors={errors.password ? [{ message: errors.password }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.confirmPassword)}>
							<FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
							<Input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								autoComplete="new-password"
								value={values.confirmPassword}
								onChange={(event) => update("confirmPassword", event.target.value)}
								aria-invalid={Boolean(errors.confirmPassword)}
								aria-describedby={
									errors.confirmPassword ? "confirmPassword-error" : undefined
								}
							/>
							<FieldError
								id="confirmPassword-error"
								errors={
									errors.confirmPassword
										? [{ message: errors.confirmPassword }]
										: undefined
								}
							/>
						</Field>

						<Button type="submit" size="lg" disabled={pending}>
							{pending ? "Creating account…" : "Create account"}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>

			<CardFooter>
				<p className="text-sm text-muted-foreground">
					Already registered?{" "}
					<Link href="/login" className="underline underline-offset-4">
						Sign in
					</Link>
				</p>
			</CardFooter>
		</Card>
	);
}
