import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { QuestionList } from "@/components/mcq/question-list";
import { buttonVariants } from "@/components/ui/button";

export default function McqPage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
			<header className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading text-xl font-medium">Multiple choice questions</h1>
					<p className="text-sm text-muted-foreground">
						Write questions, edit them, and try them out.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link href="/mcq/new" className={buttonVariants()}>
						New question
					</Link>
					<LogoutButton />
				</div>
			</header>

			<QuestionList />
		</main>
	);
}
