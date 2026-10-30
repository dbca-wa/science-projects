/**
 * Document Edit Permission Utilities
 *
 * Calculates whether a user can edit a project document based on their role,
 * caretaker relationships, and the document's approval status.
 *
 * Permission logic (from the original app):
 * A user can edit a document if:
 *   - They are in the project team, OR are the BA lead, OR are a caretaker of the BA leader,
 *     OR are a caretaker of a team member — AND the document is NOT fully approved
 *   - OR they are a superuser
 *   - OR they are a caretaker of an admin (superuser)
 */

import type { IUserMe } from "@/shared/types/user.types";
import type { IProjectMember } from "@/shared/types/project.types";
import type { IMainDoc } from "@/shared/types/document.types";

interface DocumentEditPermissionParams {
	/** Current authenticated user */
	currentUser: IUserMe | null | undefined;
	/** Project team members */
	members: IProjectMember[] | null;
	/** The document's main document object (contains approval flags) */
	document: IMainDoc;
	/** Whether the current user is the business area lead */
	isBaLead?: boolean;
	/** Whether the current user is a caretaker of the BA leader */
	userIsCaretakerOfBaLeader?: boolean;
	/** Whether the current user is a caretaker of an admin (superuser) */
	userIsCaretakerOfAdmin?: boolean;
}

/**
 * Calculate whether a user can edit a project document.
 *
 * @returns true if the user has permission to edit the document
 */
export function calculateDocumentEditPermission({
	currentUser,
	members,
	document,
	isBaLead = false,
	userIsCaretakerOfBaLeader = false,
	userIsCaretakerOfAdmin = false,
}: DocumentEditPermissionParams): boolean {
	if (!currentUser) return false;

	// Superusers can always edit
	if (currentUser.is_superuser) return true;

	// Caretakers of admin (superuser) can always edit
	if (userIsCaretakerOfAdmin) return true;

	// Check if the document is fully approved (all three approval stages granted)
	const isFullyApproved =
		document.project_lead_approval_granted &&
		document.business_area_lead_approval_granted &&
		document.directorate_approval_granted;

	// If fully approved, only superusers and caretakers of admin can edit (handled above)
	if (isFullyApproved) return false;

	// Check if user is in the project team
	const userInTeam =
		members?.some((member) => member.user.id === currentUser.id) ?? false;

	if (userInTeam) return true;

	// Check if user is the BA lead
	if (isBaLead) return true;

	// Check if user is a caretaker of the BA leader
	if (userIsCaretakerOfBaLeader) return true;

	return false;
}

interface RelatedProjectsEditPermissionParams {
	/** Current authenticated user */
	currentUser: IUserMe | null | undefined;
	/** Project team members */
	members: IProjectMember[] | null;
	/** Whether the current user is the business area lead */
	isBaLead?: boolean;
	/** Whether the current user is a caretaker of the BA leader */
	userIsCaretakerOfBaLeader?: boolean;
	/** Whether the current user is a caretaker of the project leader */
	userIsCaretakerOfProjectLeader?: boolean;
	/** Whether the current user is a caretaker of an admin (superuser) */
	userIsCaretakerOfAdmin?: boolean;
}

/**
 * Calculate whether a user can change a project plan's related projects list.
 *
 * The same people who work on the plan, but without document locking: the list
 * stays editable after the plan is approved. Mirrors the backend's
 * CanEditProject permission:
 *   - superusers, and caretakers of a superuser
 *   - project team members
 *   - the business area lead, and caretakers of the BA leader
 *   - caretakers of the project leader
 */
export function calculateRelatedProjectsEditPermission({
	currentUser,
	members,
	isBaLead = false,
	userIsCaretakerOfBaLeader = false,
	userIsCaretakerOfProjectLeader = false,
	userIsCaretakerOfAdmin = false,
}: RelatedProjectsEditPermissionParams): boolean {
	if (!currentUser) return false;
	if (currentUser.is_superuser || userIsCaretakerOfAdmin) return true;

	const userInTeam =
		members?.some((member) => member.user.id === currentUser.id) ?? false;

	return (
		userInTeam ||
		isBaLead ||
		userIsCaretakerOfBaLeader ||
		userIsCaretakerOfProjectLeader
	);
}
