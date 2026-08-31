"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function handleLogout() {
		setPending(true);

		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch {
			// There is no session to clear, so a failed call must not trap the user here.
		}

		router.push("/login");
	}

	return (
		<Button variant="outline" onClick={handleLogout} disabled={pending}>
			Log out
		</Button>
	);
}
