import { Link } from "react-router";
import { Loader2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
	ProjectKindBadge,
	ProjectStatusBadge,
} from "@/shared/components/projects";
import type { IRelatedProject } from "@/shared/types/document.types";
import { toPlainText } from "@/shared/utils/sanitise.utils";
import { FromPreviousTextLabel } from "./FromPreviousTextLabel";

interface RelatedProjectItemProps {
	row: IRelatedProject;
	canEdit: boolean;
	/** The remove request for this item is running */
	isRemoving: boolean;
	onRemove: (row: IRelatedProject) => void;
	/** Lets the section move focus here after another item is removed */
	removeButtonRef?: (element: HTMLButtonElement | null) => void;
}

/**
 * One project in a plan's related projects list
 */
export const RelatedProjectItem = ({
	row,
	canEdit,
	isRemoving,
	onRemove,
	removeButtonRef,
}: RelatedProjectItemProps) => {
	const project = row.related_project;
	const title = toPlainText(project.title);

	return (
		<li className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					{/* Inline text flow lets a long title wrap under the tag on narrow screens */}
					<Link
						to={`/projects/${project.id}/overview`}
						className="group line-clamp-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:line-clamp-2"
						title={title}
					>
						<span className="mr-1 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 align-baseline font-mono text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
							{project.tag}
						</span>{" "}
						<span className="font-semibold text-blue-700 group-hover:underline dark:text-blue-300">
							{title}
						</span>
					</Link>

					<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
						<ProjectKindBadge kind={project.kind} />
						<ProjectStatusBadge status={project.status} />
						{project.leader && <span>Leader: {project.leader}</span>}
						{row.source === "script" && <FromPreviousTextLabel />}
					</div>
				</div>

				{canEdit && (
					// aria-disabled rather than disabled keeps focus on the button
					// while the request runs
					<Button
						ref={removeButtonRef}
						type="button"
						variant="ghost"
						size="icon"
						className="size-11 shrink-0 text-gray-600 hover:text-gray-900 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:size-8 dark:text-gray-400 dark:hover:text-gray-100"
						onClick={() => {
							if (!isRemoving) onRemove(row);
						}}
						aria-disabled={isRemoving || undefined}
						aria-label={`Remove ${project.tag} from related projects`}
					>
						{isRemoving ? (
							<Loader2 className="size-4 animate-spin" aria-hidden="true" />
						) : (
							<X className="size-4" aria-hidden="true" />
						)}
					</Button>
				)}
			</div>
		</li>
	);
};
