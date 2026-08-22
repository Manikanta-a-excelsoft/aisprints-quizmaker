import type { Metadata } from "next";

import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
	title: "Create your account",
};

export default function RegisterPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
			<RegisterForm />
		</main>
	);
}
