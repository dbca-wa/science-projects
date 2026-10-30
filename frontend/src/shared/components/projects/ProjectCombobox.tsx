import { forwardRef, useCallback } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
	BaseCombobox,
	type BaseComboboxRef,
} from "@/shared/components/combobox";
import { searchProjects } from "@/shared/services/project-search.service";
import type { IProjectSearchResult } from "@/shared/types/project.types";
import { formatProjectTag } from "@/shared/utils/project-tag.utils";
import { toPlainText } from "@/shared/utils/sanitise.utils";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

/**
 * ProjectCombobox - search for a project and pick it
 *
 * Wraps BaseCombobox with project search, the same way UserCombobox does for
 * users. It acts as an "add" control: picking a project calls onSelect and
 * clears the field, ready for the next search.
 *
 * Projects in excludeProjectIds are never offered, so they cannot be picked.
 * Results are exposed as an ARIA listbox; focus stays in the input while the
 * user moves through them.
 *
 * @example
 * ```tsx
 * <ProjectCombobox
 *   label="Add a related project"
 *   excludeProjectIds={[currentProjectId, ...linkedIds]}
 *   onSelect={(project) => addProject(project.id)}
 * />
 * ```
 */
export interface ProjectComboboxProps {
	onSelect: (project: IProjectSearchResult) => void;
	/** Projects that must not be offered, e.g. the current project */
	excludeProjectIds?: number[];
	label?: string;
	placeholder?: string;
	helperText?: string;
	/** Accessible name when no label is shown */
	ariaLabel?: string;
	disabled?: boolean;
	maxResults?: number;
}

export const ProjectCombobox = forwardRef<
	BaseComboboxRef,
	ProjectComboboxProps
>(
	(
		{
			onSelect,
			excludeProjectIds = [],
			label,
			placeholder = "Search by title or tag, e.g. SP-2024-11",
			helperText,
			ariaLabel = "Search for a project",
			disabled,
			maxResults = 10,
		},
		ref
	) => {
		// A stable key keeps the search function (and BaseCombobox's search
		// effect) from changing on every render
		const excludeKey = excludeProjectIds.join(",");

		const searchFn = useCallback(
			async (searchTerm: string): Promise<IProjectSearchResult[]> => {
				const excluded = new Set(
					excludeKey ? excludeKey.split(",").map(Number) : []
				);
				const results = await searchProjects(searchTerm);
				return results
					.filter((project) => !excluded.has(project.id))
					.slice(0, maxResults);
			},
			[excludeKey, maxResults]
		);

		return (
			<BaseCombobox<IProjectSearchResult>
				ref={ref}
				searchFn={searchFn}
				value={null}
				onChange={(project: IProjectSearchResult | null) => {
					if (project) onSelect(project);
				}}
				getItemKey={(project: IProjectSearchResult) => project.id}
				renderSelected={() => null}
				renderMenuItem={(
					project: IProjectSearchResult,
					_select: (project: IProjectSearchResult) => void,
					isHighlighted: boolean
				) => (
					<ProjectMenuItem project={project} isHighlighted={isHighlighted} />
				)}
				label={label}
				placeholder={placeholder}
				helperText={helperText}
				ariaLabel={ariaLabel}
				disabled={disabled}
				minSearchLength={2}
				maxResults={maxResults}
				listbox
				showIcon
				icon={
					<Search
						className="size-4 text-gray-500 dark:text-gray-400"
						aria-hidden="true"
					/>
				}
			/>
		);
	}
);

ProjectCombobox.displayName = "ProjectCombobox";

interface ProjectMenuItemProps {
	project: IProjectSearchResult;
	isHighlighted: boolean;
}

/**
 * Content of one result. The listbox option around it handles selection, so
 * this stays non-interactive.
 */
const ProjectMenuItem = ({ project, isHighlighted }: ProjectMenuItemProps) => {
	const tag = formatProjectTag(project);
	const title = toPlainText(project.title);

	return (
		<div
			className={cn(
				"w-full text-left px-3 py-2 flex items-center gap-3 transition-colors cursor-pointer",
				isHighlighted && "bg-gray-200 dark:bg-gray-600"
			)}
			title={title}
		>
			{/* The spaces separate the parts in the option's accessible name */}
			<span className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
				{tag}
			</span>{" "}
			<span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100">
				{title}
			</span>{" "}
			<ProjectStatusBadge status={project.status} className="shrink-0" />
		</div>
	);
};
