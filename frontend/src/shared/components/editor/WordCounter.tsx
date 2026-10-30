import { useMemo } from "react";
import { countWords } from "@/shared/utils/word-count.utils";

export interface WordCounterProps {
	content: string;
	limit?: number;
	showLimit?: boolean;
	/** The limit is a suggestion: going over it is flagged as advice, not an error */
	limitCanBePassed?: boolean;
}

/**
 * WordCounter component
 *
 * Displays current word count with:
 * - Warning when limit exceeded
 * - Accessible colour contrast
 * - ARIA live region for count updates
 */
export function WordCounter({
	content,
	limit,
	showLimit = true,
	limitCanBePassed = false,
}: WordCounterProps) {
	const wordCount = useMemo(() => countWords(content), [content]);
	const isOverLimit = limit !== undefined && wordCount > limit;
	const isApproachingLimit = limit !== undefined && wordCount >= limit * 0.9;
	const overLimitClass = limitCanBePassed
		? "text-amber-700 dark:text-amber-400 font-medium"
		: "text-red-600 font-medium";

	return (
		<div
			className="text-sm"
			role="status"
			aria-live={isApproachingLimit ? "assertive" : "polite"}
			aria-atomic="true"
		>
			<span className={isOverLimit ? overLimitClass : "text-gray-600"}>
				{wordCount}
				{limit !== undefined && showLimit && ` / ${limit}`}
				{wordCount === 1 ? " word" : " words"}
			</span>

			{isOverLimit && !limitCanBePassed && (
				<span className="ml-2 text-red-600 font-medium" role="alert">
					(exceeds limit by {wordCount - limit})
				</span>
			)}

			{isOverLimit && limitCanBePassed && (
				<span className={`ml-2 ${overLimitClass}`}>
					(over suggested limit by {wordCount - limit})
				</span>
			)}
		</div>
	);
}
