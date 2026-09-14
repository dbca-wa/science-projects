/**
 * Document locking utilities
 *
 * Centralised logic for determining when documents, rich text fields,
 * and approval actions should be locked based on project lifecycle state.
 *
 * Locking rules:
 * - Any document with final approval (status === "approved") → rich text locked
 * - Concept plan → also locked if a successor project plan exists
 * - Project plan → also locked if successor progress reports exist
 * - Progress/student reports → older reports locked when a newer year exists
 * - Document approval actions → locked when the document is locked
 * - Report creation → locked when project is terminated/completed or has approved closure
 */

import type { IMainDoc } from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectDocuments,
} from "@/shared/types/project.types";

/**
 * Whether a document has received final (directorate) approval.
 */
export const isDocumentFullyApproved = (document: IMainDoc): boolean => {
	return document.status === "approved";
};

/**
 * Whether a concept plan should be locked.
 *
 * Locked when approved AND a project plan already exists (successor document).
 */
export const isConceptPlanLocked = (
	document: IMainDoc,
	allDocuments?: IProjectDocuments
): boolean => {
	return isDocumentFullyApproved(document) && !!allDocuments?.project_plan;
};

/**
 * Whether a project plan should be locked.
 *
 * Locked when approved AND progress reports exist (successor documents).
 */
export const isProjectPlanLocked = (
	document: IMainDoc,
	allDocuments?: IProjectDocuments
): boolean => {
	return (
		isDocumentFullyApproved(document) &&
		!!allDocuments?.progress_reports &&
		allDocuments.progress_reports.length > 0
	);
};

/**
 * Whether a year-based report (progress or student) is locked.
 *
 * Only locks older reports that are already approved. Reports still in
 * progress (new, inapproval, revising) remain editable even for older
 * years — this handles the case where reports are created retroactively.
 */
export const isOlderReportLocked = (
	selectedYear: number,
	allYears: number[],
	documentStatus?: string
): boolean => {
	if (allYears.length === 0) return false;
	const latestYear = Math.max(...allYears);
	if (selectedYear >= latestYear) return false;
	// Older year — only lock if the document is already approved
	return documentStatus === "approved";
};

/**
 * Whether rich text editing should be disabled for a document.
 *
 * Returns true when the document has final approval — regardless of
 * whether a successor document exists. Once fully approved, content
 * is preserved as a historical record.
 */
export const isRichTextLocked = (document: IMainDoc): boolean => {
	return isDocumentFullyApproved(document);
};

/**
 * Whether the project is in a closed/terminal state.
 *
 * Used to lock creation of new reports and other forward-looking actions.
 */
export const isProjectInClosedState = (project: IProjectData): boolean => {
	return (
		project.status === "completed" ||
		project.status === "terminated" ||
		project.status === "closure_requested"
	);
};

/**
 * Whether an approved project closure exists.
 */
export const hasApprovedProjectClosure = (
	allDocuments?: IProjectDocuments
): boolean => {
	return (
		!!allDocuments?.project_closure?.document?.status &&
		allDocuments.project_closure.document.status === "approved"
	);
};

/**
 * Whether creation of new reports (progress/student) should be locked.
 *
 * Locked when the project is in a terminal state or has an approved closure.
 */
export const isReportCreationLocked = (
	project: IProjectData,
	allDocuments?: IProjectDocuments
): boolean => {
	return (
		isProjectInClosedState(project) || hasApprovedProjectClosure(allDocuments)
	);
};

/**
 * Compute the effective canEdit for a document's rich text fields.
 *
 * Takes the base permission (from calculateDocumentEditPermission) and
 * applies document-level locking: if the document is fully approved or
 * the document tab is locked, editing is disabled — unless the user is
 * a superuser, in which case locking is bypassed for content editing.
 *
 * Content remains copyable in read-only mode via RichTextDisplay.
 */
export const getEffectiveCanEdit = (
	canEditBase: boolean,
	document: IMainDoc,
	isTabLocked: boolean,
	isSuperuser = false,
	hasActiveException = false
): boolean => {
	// Superusers bypass all document locking for content editing
	if (isSuperuser) return true;
	// A user with an active edit exception may edit the locked document
	if (hasActiveException) return true;
	if (isTabLocked) return false;
	if (isRichTextLocked(document)) return false;
	return canEditBase;
};

/**
 * Format an expiry timestamp into a short, human-readable date and time.
 */
const formatExpiry = (expiresAt?: string): string | undefined => {
	if (!expiresAt) return undefined;
	const date = new Date(expiresAt);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

/**
 * Get a human-readable message explaining why a document field is locked, or
 * that the current user has temporary edit access under an exception.
 *
 * Returns undefined if the field is editable with no message needed.
 */
export const getLockedMessage = (
	document: IMainDoc,
	isTabLocked: boolean,
	tabLockedReason?: string,
	hasActiveException = false,
	exceptionExpiresAt?: string
): string | undefined => {
	// When the user holds an active exception, communicate the temporary
	// access rather than a read-only lock message.
	if (hasActiveException) {
		const expiry = formatExpiry(exceptionExpiresAt);
		return expiry
			? `You have temporary edit access to this locked document until ${expiry}.`
			: "You have temporary edit access to this locked document.";
	}
	if (isTabLocked && tabLockedReason) return tabLockedReason;
	if (isTabLocked)
		return "This document is locked. The project has progressed past this stage.";
	if (isRichTextLocked(document))
		return "This field is locked because the document has been fully approved.";
	return undefined;
};
