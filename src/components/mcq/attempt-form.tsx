"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	GENERIC_ERROR,
	submitAttempt,
	type AttemptView,
	type QuestionView,
} from "@/lib/mcq-client";

export function AttemptForm({ question }: { question: QuestionView }) {
	const [choiceId, setChoiceId] = useState<string | null>(null);
	const [result, setResult] = useState<AttemptView | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const choices = [...question.choices].sort((a, b) => a.position - b.position);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!choiceId) return;

		setError(null);
		setPending(true);
		const response = await submitAttempt(question.id, choiceId);
		setPending(false);

		if (!response.ok) {
			setError(response.message ?? GENERIC_ERROR);
			return;
		}

		setResult(response.data);
	}

	function tryAgain() {
		// Each submit writes its own row, so a retry starts from nothing chosen.
		setResult(null);
		setError(null);
		setChoiceId(null);
	}

	const answered = result !== null;
	const correctChoice = choices.find(
		(choice) => choice.id === result?.correctChoiceId,
	);

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>
					<h1>{question.name}</h1>
				</CardTitle>
				<CardDescription>{question.questionText}</CardDescription>
			</CardHeader>

			<CardContent className="flex flex-col gap-6">
				{error && (
					<div
						role="alert"
						className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						{error}
					</div>
				)}

				{answered && (
					<div
						role="status"
						className="rounded-lg bg-muted px-3 py-2 text-sm font-medium"
					>
						{result.attempt.isCorrect ? (
							<span>Correct</span>
						) : (
							<span className="text-destructive">
								Not quite. The correct answer was “{correctChoice?.text}”.
							</span>
						)}
					</div>
				)}

				<form onSubmit={handleSubmit} noValidate>
					<div className="flex flex-col gap-6">
						<RadioGroup
							value={choiceId ?? ""}
							onValueChange={(value) => setChoiceId(String(value))}
							aria-label="Choices"
							disabled={answered}
						>
							{choices.map((choice) => {
								const isAnswer = answered && choice.id === result.correctChoiceId;
								return (
									<div
										key={choice.id}
										data-testid={`choice-${choice.id}`}
										className="flex items-center gap-2"
									>
										<RadioGroupItem
											id={`choice-input-${choice.id}`}
											value={choice.id}
											aria-label={choice.text}
											disabled={answered}
										/>
										<FieldLabel htmlFor={`choice-input-${choice.id}`}>
											{choice.text}
										</FieldLabel>
										{isAnswer && <Badge variant="secondary">Correct answer</Badge>}
									</div>
								);
							})}
						</RadioGroup>

						<div className="flex items-center gap-3">
							{answered ? (
								<Button type="button" size="lg" onClick={tryAgain}>
									Try again
								</Button>
							) : (
								<Button type="submit" size="lg" disabled={!choiceId || pending}>
									{pending ? "Checking…" : "Submit answer"}
								</Button>
							)}
							<Link
								href="/mcq"
								className={buttonVariants({ variant: "outline", size: "lg" })}
							>
								Back to questions
							</Link>
						</div>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
