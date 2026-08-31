import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
	title: "Sign in",
};

export default function LoginPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
			<LoginForm />
		</main>
	);
}
