import { useId } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ProjectStatusBadge } from "@/shared/components/projects";
import type { IRelatedProject } from "@/shared/types/document.types";
import { toPlainText } from "@/shared/utils/sanitise.utils";

interface RelatedProjectSuggestionsProps {
	suggestions: IRelatedProject[];
	/** Rows with a request running */
	busyRowIds: number[];
	onAccept: (row: IRelatedProject) => void;
	onDismiss: (row: IRelatedProject) => void;
	/** Records each Add button so focus can move to it after a change */
	registerAddButton: (rowId: number, element: HTMLButtonElement | null) => void;
}

// aria-disabled rather than disabled keeps focus on the button while the
// request runs
const BUSY_BUTTON_CLASSES =
	"h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:h-8";

/**
 * Projects the matching script found in the legacy text but could not
 * confirm. Each can be added to the list or dismissed. Shown to editors only.
 */
export const RelatedProjectSuggestions = ({
	suggestions,
	busyRowIds,
	onAccept,
	onDismiss,
	registerAddButton,
}: RelatedProjectSuggestionsProps) => {
	const headingId = useId();
	const descriptionId = useId();

	if (suggestions.length === 0) return null;

	return (
		<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
			<h4
				id={headingId}
				className="text-sm font-semibold text-amber-900 dark:text-amber-100"
			>
				Suggested from previous text
			</h4>
			<p
				id={descriptionId}
				className="mt-1 text-sm text-amber-900 dark:text-amber-200"
			>
				The previous text may refer to these projects. Add the ones that are
				related and dismiss the rest.
			</p>

			<ul
				role="list"
				aria-labelledby={headingId}
				aria-describedby={descriptionId}
				className="mt-3 space-y-2"
			>
				{suggestions.map((row) => {
					const project = row.related_project;
					const title = toPlainText(project.title);
					const isBusy = busyRowIds.includes(row.id);

					return (
						<li
							key={row.id}
							className="flex flex-col gap-3 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-start dark:border-amber-900 dark:bg-gray-900"
						>
							<div className="min-w-0 flex-1">
								{/* Inline text flow lets a long title wrap under the tag */}
								<p
									className="line-clamp-3 font-medium text-gray-900 sm:line-clamp-2 dark:text-gray-100"
									title={title}
								>
									<span className="mr-1 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 align-baseline font-mono text-xs font-normal text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
										{project.tag}
									</span>{" "}
									{title}
								</p>
								<div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
									<ProjectStatusBadge status={project.status} />
									{row.matched_text && (
										<span>Mentioned as &ldquo;{row.matched_text}&rdquo;</span>
									)}
								</div>
							</div>

							<div className="flex shrink-0 gap-2">
								<Button
									ref={(element) => registerAddButton(row.id, element)}
									type="button"
									size="sm"
									variant="outline"
									className={BUSY_BUTTON_CLASSES}
									onClick={() => {
										if (!isBusy) onAccept(row);
									}}
									aria-disabled={isBusy || undefined}
									aria-label={`Add ${project.tag} to related projects`}
								>
									{isBusy ? (
										<Loader2
											className="size-4 animate-spin"
											aria-hidden="true"
										/>
									) : (
										<Check className="size-4" aria-hidden="true" />
									)}
									Add
								</Button>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className={BUSY_BUTTON_CLASSES}
									onClick={() => {
										if (!isBusy) onDismiss(row);
									}}
									aria-disabled={isBusy || undefined}
									aria-label={`Dismiss suggestion ${project.tag}`}
								>
									<X className="size-4" aria-hidden="true" />
									Dismiss
								</Button>
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
};
