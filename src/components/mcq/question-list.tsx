"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { QuestionRowActions } from "@/components/mcq/question-row-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	GENERIC_ERROR,
	fetchQuestions,
	type QuestionSummaryView,
} from "@/lib/mcq-client";

const SKELETON_ROWS = 6;

function SkeletonRows() {
	return (
		<>
			{Array.from({ length: SKELETON_ROWS }, (_, index) => (
				<TableRow key={index} data-testid="question-skeleton-row">
					<TableCell>
						<Skeleton className="h-4 w-32" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-full" />
					</TableCell>
					<TableCell>
						<Skeleton className="h-4 w-8" />
					</TableCell>
					<TableCell>
						<Skeleton className="ml-auto h-7 w-7" />
					</TableCell>
				</TableRow>
			))}
		</>
	);
}

export function QuestionList() {
	const [questions, setQuestions] = useState<QuestionSummaryView[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	useEffect(() => {
		let active = true;

		void (async () => {
			const result = await fetchQuestions();
			if (!active) return;

			if (result.ok) {
				setQuestions(result.data);
			} else {
				setLoadError(result.message ?? GENERIC_ERROR);
			}
			setLoading(false);
		})();

		return () => {
			active = false;
		};
	}, []);

	// Filters the rows already in memory. No refetch, no query parameter.
	const visible = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return questions;
		return questions.filter(
			(question) =>
				question.name.toLowerCase().includes(term) ||
				question.questionText.toLowerCase().includes(term),
		);
	}, [questions, search]);

	function handleDeleted(id: string) {
		setQuestions((current) => current.filter((question) => question.id !== id));
	}

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

	// An empty bank and an unmatched filter are different situations, so only a genuinely
	// empty bank gets the card.
	if (!loading && questions.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>No questions yet</CardTitle>
					<CardDescription>
						Write your first multiple-choice question and it will appear here.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Link href="/mcq/new" className={buttonVariants()}>
						Create your first question
					</Link>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{!loading && (
				<Input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					aria-label="Search questions"
					placeholder="Search by name or question text"
					className="max-w-sm"
				/>
			)}

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Question</TableHead>
						<TableHead>Choices</TableHead>
						<TableHead className="text-right">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{loading && <SkeletonRows />}

					{!loading && visible.length === 0 && (
						<TableRow>
							<TableCell colSpan={4} className="text-muted-foreground">
								No questions match that search
							</TableCell>
						</TableRow>
					)}

					{!loading &&
						visible.map((question) => (
							<TableRow key={question.id}>
								<TableCell data-testid="question-name" className="font-medium">
									{question.name}
								</TableCell>
								<TableCell className="max-w-md">
									<span className="line-clamp-2" title={question.questionText}>
										{question.questionText}
									</span>
								</TableCell>
								<TableCell>
									<Badge variant="secondary">{question.choiceCount}</Badge>
								</TableCell>
								<TableCell className="text-right">
									<QuestionRowActions question={question} onDeleted={handleDeleted} />
								</TableCell>
							</TableRow>
						))}
				</TableBody>
			</Table>
		</div>
	);
}
