import { QuestionForm } from "@/components/mcq/question-form";

export default function NewQuestionPage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
			<QuestionForm mode="create" />
		</main>
	);
}
