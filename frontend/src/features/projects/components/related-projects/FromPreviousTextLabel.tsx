import { useId, useState } from "react";
import { FileText } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";

const EXPLANATION =
	"Added automatically from the text previously entered for this plan.";

/**
 * Small label on links the matching script added. The explanation shows on
 * hover, focus and click, and is read out with the label.
 */
export const FromPreviousTextLabel = () => {
	const [open, setOpen] = useState(false);
	const descriptionId = useId();

	return (
		<>
			<Tooltip open={open} onOpenChange={setOpen}>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="inline-flex items-center gap-1 rounded text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-gray-400 dark:hover:text-gray-200"
						aria-describedby={descriptionId}
						onFocus={() => setOpen(true)}
						onBlur={() => setOpen(false)}
						onClick={() => setOpen((isOpen) => !isOpen)}
					>
						<FileText className="size-3" aria-hidden="true" />
						From previous text
					</button>
				</TooltipTrigger>
				<TooltipContent>{EXPLANATION}</TooltipContent>
			</Tooltip>
			<span id={descriptionId} className="sr-only">
				{EXPLANATION}
			</span>
		</>
	);
};
