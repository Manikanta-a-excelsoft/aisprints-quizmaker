import { LogoutButton } from "@/components/auth/logout-button";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function McqPage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
			<header className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading text-xl font-medium">Multiple choice quiz</h1>
					<p className="text-sm text-muted-foreground">
						You are signed in. This is where quizzes will appear.
					</p>
				</div>
				<LogoutButton />
			</header>

			<Card>
				<CardHeader>
					<CardTitle>Nothing to answer yet</CardTitle>
					<CardDescription>
						Quiz generation and scoring arrive in a later sprint. This sprint only
						covers registering, signing in and signing out.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Badge variant="secondary">Placeholder</Badge>
				</CardContent>
			</Card>
		</main>
	);
}
