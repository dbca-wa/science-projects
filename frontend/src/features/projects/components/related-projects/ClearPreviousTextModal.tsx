import { useId, useRef } from "react";
import { Loader2 } from "lucide-react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";

interface ClearPreviousTextModalProps {
	open: boolean;
	isClearing: boolean;
	/** Suggestions still waiting for a decision, which clearing leaves in place */
	suggestionCount: number;
	onCancel: () => void;
	onConfirm: () => void;
}

const suggestionNote = (count: number) =>
	count === 1
		? "The suggestion found in this text stays until you add or dismiss it."
		: `The ${count} suggestions found in this text stay until you add or dismiss them.`;

/**
 * Confirms clearing a plan's previously recorded related projects text
 */
export const ClearPreviousTextModal = ({
	open,
	isClearing,
	suggestionCount,
	onCancel,
	onConfirm,
}: ClearPreviousTextModalProps) => {
	const descriptionId = useId();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const confirmRef = useRef<HTMLButtonElement>(null);

	// While the request runs the dialogue stays open: the text is being
	// cleared whatever the user does next
	const cancel = () => {
		if (!isClearing) onCancel();
	};

	// Keep Tab and Shift+Tab on the dialogue's buttons
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key !== "Tab") return;
		const first = cancelRef.current;
		const last = confirmRef.current;
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	return (
		<AlertDialog
			open={open}
			onOpenChange={(next) => {
				if (!next) cancel();
			}}
		>
			<AlertDialogContent>
				<div onKeyDown={handleKeyDown}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Clear the previously recorded text?
						</AlertDialogTitle>
						<AlertDialogDescription>
							<div id={descriptionId} className="space-y-2">
								<p>
									The free text will be removed from this plan and will not
									appear in PDFs generated from now on. The related projects
									list is not affected.
								</p>
								{suggestionCount > 0 && (
									<p>{suggestionNote(suggestionCount)}</p>
								)}
								<p className="font-medium text-gray-900 dark:text-gray-100">
									This cannot be undone.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>

					{/* aria-disabled rather than disabled keeps focus on the buttons
					    while the request runs */}
					<AlertDialogFooter>
						<Button
							ref={cancelRef}
							type="button"
							variant="outline"
							className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
							onClick={cancel}
							aria-disabled={isClearing || undefined}
							aria-describedby={descriptionId}
							autoFocus
						>
							Cancel
						</Button>
						<Button
							ref={confirmRef}
							type="button"
							variant="destructive"
							className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
							onClick={() => {
								if (!isClearing) onConfirm();
							}}
							aria-disabled={isClearing || undefined}
							aria-describedby={descriptionId}
						>
							{isClearing && (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							)}
							{isClearing ? "Clearing…" : "Clear text"}
						</Button>
					</AlertDialogFooter>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	);
};
