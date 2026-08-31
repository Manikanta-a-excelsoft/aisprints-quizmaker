import { QuestionLoader } from "@/components/mcq/question-loader";

export default async function AttemptQuestionPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
			<QuestionLoader id={id} mode="attempt" />
		</main>
	);
}
