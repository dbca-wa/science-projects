import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
	useAddRelatedProject,
	useClearLegacyRelatedProjects,
	useRemoveRelatedProject,
} from "@/features/projects/hooks/useRelatedProjects";
import type { BaseComboboxRef } from "@/shared/components/combobox";
import { ProjectCombobox } from "@/shared/components/projects";
import type {
	IProjectPlan,
	IRelatedProject,
} from "@/shared/types/document.types";
import type { IProjectSearchResult } from "@/shared/types/project.types";
import { formatProjectTag } from "@/shared/utils/project-tag.utils";
import { isRichTextEmpty } from "@/shared/utils/rich-text.utils";
import { ClearPreviousTextModal } from "./ClearPreviousTextModal";
import { PreviousTextPanel } from "./PreviousTextPanel";
import { RelatedProjectList } from "./RelatedProjectList";
import { RelatedProjectSuggestions } from "./RelatedProjectSuggestions";

type FocusTarget =
	| { kind: "remove"; rowId: number }
	| { kind: "suggestion"; rowId: number }
	| { kind: "clear" }
	| { kind: "combobox" };

/**
 * Where focus goes when a row leaves a list: the next row, else the previous
 * row, else the project search.
 */
const getFocusTargetAfter = (
	rows: IRelatedProject[],
	row: IRelatedProject,
	kind: "remove" | "suggestion"
): FocusTarget => {
	const index = rows.findIndex((candidate) => candidate.id === row.id);
	const neighbour = rows[index + 1] ?? rows[index - 1];
	return neighbour ? { kind, rowId: neighbour.id } : { kind: "combobox" };
};

interface RelatedProjectsSectionProps {
	projectPlan: IProjectPlan;
	projectId: number;
	/**
	 * May add, remove, accept and dismiss, and clear the previously recorded
	 * text; document locking does not apply
	 */
	canEditList: boolean;
}

/**
 * The Related Science Projects section of a project plan: the linked
 * projects, a search to add more, the matching script's suggestions, and the
 * previously recorded free text while it still has content.
 */
export const RelatedProjectsSection = ({
	projectPlan,
	projectId,
	canEditList,
}: RelatedProjectsSectionProps) => {
	const headingId = useId();
	// A backend that predates related project links (for example during a
	// rolling deployment) omits these fields
	const links = projectPlan.related_project_links ?? [];
	const suggestions = projectPlan.related_project_suggestions ?? [];

	const addMutation = useAddRelatedProject(projectPlan.id, projectId);
	const removeMutation = useRemoveRelatedProject(projectPlan.id, projectId);
	const clearMutation = useClearLegacyRelatedProjects(
		projectPlan.id,
		projectId
	);

	// Requests in flight: rows being changed, and projects being added
	const [busyRowIds, setBusyRowIds] = useState<number[]>([]);
	const [pendingProjects, setPendingProjects] = useState<
		{ id: number; tag: string }[]
	>([]);
	const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

	// The key changes with every message so a repeated message is announced
	const [announcement, setAnnouncement] = useState({ key: 0, text: "" });
	const announce = useCallback((text: string) => {
		setAnnouncement((previous) => ({ key: previous.key + 1, text }));
	}, []);

	const headingRef = useRef<HTMLHeadingElement>(null);
	const comboboxRef = useRef<BaseComboboxRef>(null);
	const clearButtonRef = useRef<HTMLButtonElement>(null);
	const removeButtonsRef = useRef(new Map<number, HTMLButtonElement>());
	const addButtonsRef = useRef(new Map<number, HTMLButtonElement>());
	const pendingFocusRef = useRef<FocusTarget | null>(null);

	const registerRemoveButton = useCallback(
		(rowId: number, element: HTMLButtonElement | null) => {
			if (element) removeButtonsRef.current.set(rowId, element);
			else removeButtonsRef.current.delete(rowId);
		},
		[]
	);
	const registerAddButton = useCallback(
		(rowId: number, element: HTMLButtonElement | null) => {
			if (element) addButtonsRef.current.set(rowId, element);
			else addButtonsRef.current.delete(rowId);
		},
		[]
	);

	// Move focus once a change has finished, so it is not lost with the row
	// that left the list or the dialogue that closed. Runs after every render;
	// the target is set just before the state update that ends the change.
	useEffect(() => {
		const target = pendingFocusRef.current;
		if (!target) return;
		pendingFocusRef.current = null;

		const element =
			target.kind === "remove"
				? removeButtonsRef.current.get(target.rowId)
				: target.kind === "suggestion"
					? addButtonsRef.current.get(target.rowId)
					: target.kind === "clear"
						? (clearButtonRef.current ?? undefined)
						: undefined;
		if (element) element.focus();
		else comboboxRef.current?.focusInput();
	});

	// Only text recorded before projects could be linked is shown. New plans
	// and cleared text have nothing to show, so the panel is left out.
	const showPreviousText = !isRichTextEmpty(projectPlan.related_projects);

	// If the text disappears while it holds focus (cleared elsewhere and
	// refetched), keep focus in the section
	const showedPreviousTextRef = useRef(showPreviousText);
	useEffect(() => {
		const wasShown = showedPreviousTextRef.current;
		showedPreviousTextRef.current = showPreviousText;
		if (!wasShown || showPreviousText) return;

		const active = document.activeElement;
		if (active && active !== document.body) return;
		if (canEditList) comboboxRef.current?.focusInput();
		else headingRef.current?.focus();
	}, [showPreviousText, canEditList]);

	const startRequest = (rowId: number) =>
		setBusyRowIds((ids) => [...ids, rowId]);
	const endRequest = (rowId: number) =>
		setBusyRowIds((ids) => ids.filter((id) => id !== rowId));

	const handleSelectProject = async (project: IProjectSearchResult) => {
		const tag = formatProjectTag(project);
		setPendingProjects((pending) => [...pending, { id: project.id, tag }]);
		try {
			await addMutation.mutateAsync(project.id);
			announce(`Added ${tag} to related projects`);
		} catch {
			// The mutation shows the error
		} finally {
			setPendingProjects((pending) =>
				pending.filter((item) => item.id !== project.id)
			);
		}
	};

	const handleRemove = async (row: IRelatedProject) => {
		const tag = row.related_project.tag;
		const focusTarget = getFocusTargetAfter(links, row, "remove");
		startRequest(row.id);
		try {
			await removeMutation.mutateAsync(row.id);
			pendingFocusRef.current = focusTarget;
			announce(`Removed ${tag} from related projects`);
			toast.success(`Removed ${tag} from related projects`);
		} catch {
			// The mutation shows the error; the row and the focus stay put
		} finally {
			endRequest(row.id);
		}
	};

	const handleAccept = async (row: IRelatedProject) => {
		const tag = row.related_project.tag;
		const focusTarget = getFocusTargetAfter(suggestions, row, "suggestion");
		startRequest(row.id);
		try {
			await addMutation.mutateAsync(row.related_project.id);
			pendingFocusRef.current = focusTarget;
			announce(`Added ${tag} to related projects`);
		} catch {
			// The mutation shows the error; the suggestion and the focus stay put
		} finally {
			endRequest(row.id);
		}
	};

	const handleDismiss = async (row: IRelatedProject) => {
		const tag = row.related_project.tag;
		const focusTarget = getFocusTargetAfter(suggestions, row, "suggestion");
		startRequest(row.id);
		try {
			await removeMutation.mutateAsync(row.id);
			pendingFocusRef.current = focusTarget;
			announce(`Dismissed suggestion ${tag}`);
		} catch {
			// The mutation shows the error; the suggestion and the focus stay put
		} finally {
			endRequest(row.id);
		}
	};

	// Cancelling returns focus to the button that opened the dialogue
	const handleCancelClear = () => {
		pendingFocusRef.current = { kind: "clear" };
		setIsClearDialogOpen(false);
	};

	// Clearing removes the panel and its button, so focus moves to the search
	const handleConfirmClear = async () => {
		try {
			await clearMutation.mutateAsync();
			pendingFocusRef.current = { kind: "combobox" };
			setIsClearDialogOpen(false);
			announce("Cleared the previously recorded text");
			toast.success("Previously recorded text cleared");
		} catch {
			// The mutation shows the error; the dialogue stays open
		}
	};

	// The search never offers this project, listed projects, or projects
	// that are being added
	const excludeProjectIds = [
		projectId,
		...links.map((row) => row.related_project.id),
		...pendingProjects.map((project) => project.id),
		...suggestions
			.filter((row) => busyRowIds.includes(row.id))
			.map((row) => row.related_project.id),
	];

	return (
		<section aria-labelledby={headingId}>
			<div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900/50">
				<div className="border-b border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
					<h3
						id={headingId}
						ref={headingRef}
						tabIndex={-1}
						className="text-xl font-semibold outline-none"
					>
						Related Science Projects
					</h3>
				</div>

				<div className="space-y-5 px-6 py-5">
					{canEditList && (
						<div>
							<ProjectCombobox
								ref={comboboxRef}
								label="Add a related project"
								helperText="Projects already in the list, and this project, are not shown."
								excludeProjectIds={excludeProjectIds}
								onSelect={handleSelectProject}
							/>
							{pendingProjects.map((project) => (
								<p
									key={project.id}
									className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
								>
									<Loader2 className="size-4 animate-spin" aria-hidden="true" />
									Adding {project.tag}…
								</p>
							))}
						</div>
					)}

					<RelatedProjectList
						links={links}
						canEdit={canEditList}
						busyRowIds={busyRowIds}
						onRemove={handleRemove}
						registerRemoveButton={registerRemoveButton}
						labelledBy={headingId}
					/>

					{canEditList && (
						<RelatedProjectSuggestions
							suggestions={suggestions}
							busyRowIds={busyRowIds}
							onAccept={handleAccept}
							onDismiss={handleDismiss}
							registerAddButton={registerAddButton}
						/>
					)}

					{showPreviousText && (
						<PreviousTextPanel
							html={projectPlan.related_projects ?? ""}
							canClear={canEditList}
							onClear={() => setIsClearDialogOpen(true)}
							clearButtonRef={clearButtonRef}
						/>
					)}
				</div>
			</div>

			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				className="sr-only"
			>
				<span key={announcement.key}>{announcement.text}</span>
			</div>

			{canEditList && (
				<ClearPreviousTextModal
					open={isClearDialogOpen}
					isClearing={clearMutation.isPending}
					suggestionCount={suggestions.length}
					onCancel={handleCancelClear}
					onConfirm={handleConfirmClear}
				/>
			)}
		</section>
	);
};
