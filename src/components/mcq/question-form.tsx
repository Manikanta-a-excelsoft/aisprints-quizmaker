"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
	createQuestion,
	updateQuestion,
	type QuestionView,
} from "@/lib/mcq-client";
import { pathErrors, questionInputSchema } from "@/lib/validation/mcq";

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

/** A key the list can be reordered by without React reusing the wrong input. */
type ChoiceDraft = { key: string; text: string };

let nextKey = 0;
function draft(text = ""): ChoiceDraft {
	nextKey += 1;
	return { key: `choice-${nextKey}`, text };
}

type Props =
	| { mode: "create"; question?: undefined }
	| { mode: "edit"; question: QuestionView };

export function QuestionForm({ mode, question }: Props) {
	const router = useRouter();

	const [name, setName] = useState(question?.name ?? "");
	const [questionText, setQuestionText] = useState(question?.questionText ?? "");
	const [choices, setChoices] = useState<ChoiceDraft[]>(() =>
		question
			? [...question.choices]
					.sort((a, b) => a.position - b.position)
					.map((choice) => draft(choice.text))
			: [draft(), draft()],
	);
	const [correctKey, setCorrectKey] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	// Seeding the mark has to wait for the drafts to exist, so it reads their order.
	const [seeded, setSeeded] = useState(mode === "create");
	if (!seeded && question) {
		const correctIndex = [...question.choices]
			.sort((a, b) => a.position - b.position)
			.findIndex((choice) => choice.isCorrect);
		if (correctIndex >= 0) {
			setCorrectKey(choices[correctIndex]?.key ?? null);
		}
		setSeeded(true);
	}

	function updateChoice(key: string, text: string) {
		setChoices((current) =>
			current.map((choice) => (choice.key === key ? { ...choice, text } : choice)),
		);
	}

	function addChoice() {
		setChoices((current) =>
			current.length >= MAX_CHOICES ? current : [...current, draft()],
		);
	}

	function removeChoice(key: string) {
		setChoices((current) =>
			current.length <= MIN_CHOICES
				? current
				: current.filter((choice) => choice.key !== key),
		);
		if (correctKey === key) {
			setCorrectKey(null);
		}
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		// The route's own schema, so the form and the API cannot disagree.
		const parsed = questionInputSchema.safeParse({
			name,
			questionText,
			choices: choices.map((choice) => ({
				text: choice.text,
				isCorrect: choice.key === correctKey,
			})),
		});
		if (!parsed.success) {
			setErrors(pathErrors(parsed.error));
			return;
		}

		setErrors({});
		setPending(true);

		const result =
			mode === "edit"
				? await updateQuestion(question.id, parsed.data)
				: await createQuestion(parsed.data);

		if (result.ok) {
			toast.success(mode === "edit" ? "Question updated" : "Question created");
			router.push("/mcq");
			return;
		}

		setErrors(result.fields);
		setFormError(result.message);
		setPending(false);
	}

	const atMax = choices.length >= MAX_CHOICES;
	const atMin = choices.length <= MIN_CHOICES;
	const choicesError = errors.choices;

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>
					<h1>{mode === "edit" ? "Edit question" : "New question"}</h1>
				</CardTitle>
				<CardDescription>
					Give the question a short name, write the question, then add between two and
					six choices and mark the correct one.
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

						<Field data-invalid={Boolean(errors.name)}>
							<FieldLabel htmlFor="name">Name</FieldLabel>
							<Input
								id="name"
								name="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								aria-invalid={Boolean(errors.name)}
								aria-describedby={errors.name ? "name-error" : undefined}
							/>
							<FieldDescription>
								How you will find this question in the list.
							</FieldDescription>
							<FieldError
								id="name-error"
								errors={errors.name ? [{ message: errors.name }] : undefined}
							/>
						</Field>

						<Field data-invalid={Boolean(errors.questionText)}>
							<FieldLabel htmlFor="questionText">Question text</FieldLabel>
							<Textarea
								id="questionText"
								name="questionText"
								rows={3}
								value={questionText}
								onChange={(event) => setQuestionText(event.target.value)}
								aria-invalid={Boolean(errors.questionText)}
								aria-describedby={
									errors.questionText ? "questionText-error" : undefined
								}
							/>
							<FieldError
								id="questionText-error"
								errors={
									errors.questionText ? [{ message: errors.questionText }] : undefined
								}
							/>
						</Field>

						<Field data-invalid={Boolean(choicesError)}>
							<FieldLabel>Choices</FieldLabel>
							<FieldDescription>
								Between two and six. Select the radio next to the correct answer.
							</FieldDescription>

							<RadioGroup
								value={correctKey ?? ""}
								onValueChange={(value) => setCorrectKey(String(value))}
								aria-label="Correct answer"
							>
								{choices.map((choice, index) => {
									const position = index + 1;
									const textError = errors[`choices.${index}.text`];
									return (
										<div key={choice.key} className="flex items-start gap-2">
											<RadioGroupItem
												value={choice.key}
												aria-label={`Mark choice ${position} as correct`}
												className="mt-2.5"
											/>
											<div className="flex-1">
												<Input
													value={choice.text}
													onChange={(event) =>
														updateChoice(choice.key, event.target.value)
													}
													aria-label={`Choice ${position}`}
													aria-invalid={Boolean(textError)}
													aria-describedby={
														textError ? `${choice.key}-error` : undefined
													}
												/>
												<FieldError
													id={`${choice.key}-error`}
													errors={textError ? [{ message: textError }] : undefined}
												/>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={`Remove choice ${position}`}
												disabled={atMin}
												onClick={() => removeChoice(choice.key)}
											>
												<XIcon aria-hidden="true" />
											</Button>
										</div>
									);
								})}
							</RadioGroup>

							<div className="flex items-center gap-3">
								<Button
									type="button"
									variant="outline"
									disabled={atMax}
									onClick={addChoice}
								>
									<PlusIcon aria-hidden="true" />
									Add choice
								</Button>
								{atMax && (
									<span className="text-sm text-muted-foreground">
										A question can have at most six choices
									</span>
								)}
							</div>

							<FieldError
								errors={choicesError ? [{ message: choicesError }] : undefined}
							/>
						</Field>

						<div className="flex items-center gap-3">
							<Button type="submit" size="lg" disabled={pending}>
								{mode === "edit"
									? pending
										? "Saving…"
										: "Save changes"
									: pending
										? "Creating…"
										: "Create question"}
							</Button>
							<Link
								href="/mcq"
								className={buttonVariants({ variant: "outline", size: "lg" })}
							>
								Cancel
							</Link>
						</div>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
