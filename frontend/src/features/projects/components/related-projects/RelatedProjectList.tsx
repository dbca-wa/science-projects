import type { IRelatedProject } from "@/shared/types/document.types";
import { RelatedProjectItem } from "./RelatedProjectItem";

interface RelatedProjectListProps {
	links: IRelatedProject[];
	canEdit: boolean;
	/** Rows with a request running */
	busyRowIds: number[];
	onRemove: (row: IRelatedProject) => void;
	/** Records each remove button so focus can move to it after a removal */
	registerRemoveButton: (
		rowId: number,
		element: HTMLButtonElement | null
	) => void;
	/** Id of the heading that names the list */
	labelledBy: string;
}

/**
 * A plan's linked projects, or a message when there are none
 */
export const RelatedProjectList = ({
	links,
	canEdit,
	busyRowIds,
	onRemove,
	registerRemoveButton,
	labelledBy,
}: RelatedProjectListProps) => {
	if (links.length === 0) {
		return (
			<p className="text-sm text-gray-600 dark:text-gray-400">
				No related projects have been added.
			</p>
		);
	}

	return (
		// role="list" keeps list semantics in Safari, which drops them when
		// list-style is none
		<ul role="list" aria-labelledby={labelledBy} className="space-y-2">
			{links.map((row) => (
				<RelatedProjectItem
					key={row.id}
					row={row}
					canEdit={canEdit}
					isRemoving={busyRowIds.includes(row.id)}
					onRemove={onRemove}
					removeButtonRef={(element) => registerRemoveButton(row.id, element)}
				/>
			))}
		</ul>
	);
};
