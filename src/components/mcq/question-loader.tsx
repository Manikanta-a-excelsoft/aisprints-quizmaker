"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AttemptForm } from "@/components/mcq/attempt-form";
import { QuestionForm } from "@/components/mcq/question-form";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	GENERIC_ERROR,
	fetchQuestion,
	type QuestionView,
} from "@/lib/mcq-client";

type Mode = "edit" | "attempt";

/**
 * Both the edit and attempt pages need one question by id before they can render, and both
 * need the same three not-yet-ready states. Only the edit form needs the correct flags, so
 * the mode decides whether `?include=answers` is asked for.
 */
export function QuestionLoader({ id, mode }: { id: string; mode: Mode }) {
	const [question, setQuestion] = useState<QuestionView | null>(null);
	const [missing, setMissing] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;

		void (async () => {
			const result = await fetchQuestion(id, {
				includeAnswers: mode === "edit",
			});
			if (!active) return;

			if (result.ok) {
				setQuestion(result.data);
				return;
			}

			// A question that is not there is a normal outcome, not a failure to report.
			if (result.status === 404) {
				setMissing(true);
				return;
			}

			setLoadError(result.message ?? GENERIC_ERROR);
		})();

		return () => {
			active = false;
		};
	}, [id, mode]);

	if (loadError) {
		return (
			<div
				role="alert"
				className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
			>
				{loadError}
			</div>
		);
	}

	if (missing) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>Question not found</CardTitle>
					<CardDescription>
						It may have been deleted since this link was made.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Link href="/mcq" className={buttonVariants({ variant: "outline" })}>
						Back to questions
					</Link>
				</CardContent>
			</Card>
		);
	}

	if (!question) {
		return (
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<CardTitle>
						<Skeleton className="h-5 w-40" />
					</CardTitle>
					<CardDescription>
						<Skeleton className="h-4 w-64" />
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-3">
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-full" />
					<Skeleton className="h-8 w-2/3" />
				</CardContent>
			</Card>
		);
	}

	return mode === "edit" ? (
		<QuestionForm mode="edit" question={question} />
	) : (
		<AttemptForm question={question} />
	);
}
