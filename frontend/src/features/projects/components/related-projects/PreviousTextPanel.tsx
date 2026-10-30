import { useId } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { RichTextDisplay } from "@/shared/components/editor/RichTextDisplay";

interface PreviousTextPanelProps {
	/** The plan's legacy related projects HTML; only shown when it has text */
	html: string;
	/** Show the clear button, for people who manage the list */
	canClear: boolean;
	onClear: () => void;
	clearButtonRef?: React.Ref<HTMLButtonElement>;
}

/**
 * Related projects text recorded before projects could be linked. It is read
 * only: once the projects it mentions are in the list, it can be cleared.
 */
export const PreviousTextPanel = ({
	html,
	canClear,
	onClear,
	clearButtonRef,
}: PreviousTextPanelProps) => {
	const headingId = useId();

	return (
		<div
			role="group"
			aria-labelledby={headingId}
			className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 sm:p-5 dark:border-gray-600 dark:bg-gray-900/40"
		>
			<div className="flex items-start justify-between gap-3">
				<h4
					id={headingId}
					className="pt-1 text-base font-semibold text-gray-900 dark:text-gray-100"
				>
					Previously recorded (free text)
				</h4>
				{canClear && (
					<Button
						ref={clearButtonRef}
						type="button"
						variant="outline"
						size="sm"
						className="h-11 shrink-0 sm:h-8"
						onClick={onClear}
					>
						<Eraser className="size-4" aria-hidden="true" />
						Clear previous text
					</Button>
				)}
			</div>

			<RichTextDisplay content={html} className="mt-3" />

			<p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
				This was entered before related projects could be linked.
				{canClear &&
					" Add the projects it mentions to the list above, then clear this text."}
			</p>
		</div>
	);
};
