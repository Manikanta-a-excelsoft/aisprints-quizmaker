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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { postAuth } from "@/lib/auth-client";
import { fieldErrors, loginSchema } from "@/lib/validation/auth";

export function LoginForm() {
	const router = useRouter();
	const [values, setValues] = useState({ username: "", password: "" });
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	function update(field: keyof typeof values, value: string) {
		setValues((current) => ({ ...current, [field]: value }));
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		const parsed = loginSchema.safeParse(values);
		if (!parsed.success) {
			setErrors(fieldErrors(parsed.error));
			return;
		}

		setErrors({});
		setPending(true);

		const result = await postAuth("/api/auth/login", parsed.data);
		if (result.ok) {
			// Nothing is remembered about the sign in: this sprint has no session by design.
			router.push("/mcq");
			return;
		}

		setErrors(result.fields);
		setFormError(result.message);
		setPending(false);
	}

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>
					<h1>Sign in</h1>
				</CardTitle>
				<CardDescription>Use the username you registered with.</CardDescription>
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
							<FieldError
								id="username-error"
								errors={errors.username ? [{ message: errors.username }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.password)}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								name="password"
								type="password"
								autoComplete="current-password"
								value={values.password}
								onChange={(event) => update("password", event.target.value)}
								aria-invalid={Boolean(errors.password)}
								aria-describedby={errors.password ? "password-error" : undefined}
							/>
							<FieldError
								id="password-error"
								errors={errors.password ? [{ message: errors.password }] : undefined}
							/>
						</Field>

						<Button type="submit" size="lg" disabled={pending}>
							{pending ? "Signing in…" : "Sign in"}
						</Button>
					</FieldGroup>
				</form>
			</CardContent>

			<CardFooter>
				<p className="text-sm text-muted-foreground">
					No account yet?{" "}
					<Link href="/register" className="underline underline-offset-4">
						Create an account
					</Link>
				</p>
			</CardFooter>
		</Card>
	);
}
