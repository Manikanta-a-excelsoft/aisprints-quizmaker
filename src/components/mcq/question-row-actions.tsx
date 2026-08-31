"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontalIcon } from "lucide-react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	GENERIC_ERROR,
	deleteQuestion,
	type QuestionSummaryView,
} from "@/lib/mcq-client";

type Props = {
	question: QuestionSummaryView;
	onDeleted: (id: string) => void;
	/**
	 * Forwarded to the menu's own `defaultOpen`. Base UI's trigger cannot be opened under
	 * jsdom, so the component tests start the menu open to reach its contents; opening by
	 * click is covered by the browser walkthrough instead.
	 */
	defaultMenuOpen?: boolean;
};

export function QuestionRowActions({
	question,
	onDeleted,
	defaultMenuOpen,
}: Props) {
	const [confirming, setConfirming] = useState(false);
	const [pending, setPending] = useState(false);

	async function handleDelete() {
		setPending(true);
		const result = await deleteQuestion(question.id);
		setPending(false);

		if (!result.ok) {
			// The dialog stays open so the failure is visible where the action started.
			toast.error(result.message ?? GENERIC_ERROR);
			return;
		}

		setConfirming(false);
		toast.success("Question deleted");
		onDeleted(question.id);
	}

	return (
		<>
			<DropdownMenu defaultOpen={defaultMenuOpen}>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Actions for ${question.name}`}
						/>
					}
				>
					<MoreHorizontalIcon aria-hidden="true" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem render={<Link href={`/mcq/${question.id}/attempt`} />}>
						Preview
					</DropdownMenuItem>
					<DropdownMenuItem render={<Link href={`/mcq/${question.id}/edit`} />}>
						Edit
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => setConfirming(true)}
					>
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={confirming} onOpenChange={setConfirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this question?</AlertDialogTitle>
						<AlertDialogDescription>
							“{question.name}” and its choices will be removed. This cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={pending}
							onClick={handleDelete}
						>
							{pending ? "Deleting…" : "Delete question"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
