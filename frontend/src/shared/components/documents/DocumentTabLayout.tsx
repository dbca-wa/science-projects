import type { ReactNode } from "react";
import type { IMainDoc } from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectMember,
	IProjectDocuments,
} from "@/shared/types/project.types";
import type { IUserData } from "@/shared/types/user.types";
import {
	toCompactDocumentType,
	type DocumentTypeWithUnderscores,
} from "@/shared/utils/document.utils";
import { DocumentDetailsSection } from "./DocumentDetailsSection";
import { DocumentActionsSectionWithModals } from "./DocumentActionsSectionWithModals";

interface DocumentTabLayoutProps {
	document: IMainDoc;
	project: IProjectData;
	members: IProjectMember[] | null;
	documentType: DocumentTypeWithUnderscores;
	typeSpecificId?: number;
	canDelete?: boolean;
	locked?: boolean;
	// DocumentActionsSection props
	creator?: IUserData | null;
	modifier?: IUserData | null;
	userIsCaretakerOfAdmin?: boolean;
	userIsCaretakerOfBaLeader?: boolean;
	userIsCaretakerOfProjectLeader?: boolean;
	all_documents?: IProjectDocuments;
	isBaLead?: boolean;
	// Special action callbacks (passed through to wrapper)
	onCreateConceptPlan?: () => void;
	onCreateProgressReport?: () => void;
	onSetAreas?: () => void;
	onReopenProject?: () => void;
	// Comments section
	commentsSection?: ReactNode;
	children: ReactNode;
}

/**
 * Reusable layout component for document tabs
 *
 * Provides responsive layout with:
 * - Mobile to XL: Details and Actions stacked at top, content in middle, Comments at bottom
 * - 2XL+: Details, Actions, and Comments in sticky sidebar on right (with independent scroll), content on left (scrollable)
 */
export const DocumentTabLayout = ({
	document,
	project,
	members,
	documentType,
	typeSpecificId,
	canDelete = true,
	locked = false,
	creator,
	// modifier,
	userIsCaretakerOfAdmin,
	userIsCaretakerOfBaLeader,
	userIsCaretakerOfProjectLeader,
	all_documents,
	isBaLead,
	onCreateConceptPlan,
	onCreateProgressReport,
	onSetAreas,
	onReopenProject,
	commentsSection,
	children,
}: DocumentTabLayoutProps) => {
	// Convert underscore format to compact format for child components
	const compactDocumentType = toCompactDocumentType(documentType);

	return (
		<div className="space-y-6">
			{/* Top section: Details and Actions (mobile to XL) */}
			<div className="grid gap-6 sm:grid-cols-2 2xl:hidden">
				<DocumentDetailsSection
					document={document}
					project={project}
					typeSpecificId={typeSpecificId}
				/>
				<DocumentActionsSectionWithModals
					document={document}
					project={project}
					members={members}
					documentType={compactDocumentType}
					canDelete={canDelete}
					locked={locked}
					creator={creator}
					userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
					userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
					userIsCaretakerOfProjectLeader={userIsCaretakerOfProjectLeader}
					all_documents={all_documents}
					isBaLead={isBaLead}
					onCreateConceptPlan={onCreateConceptPlan}
					onCreateProgressReport={onCreateProgressReport}
					onSetAreas={onSetAreas}
					onReopenProject={onReopenProject}
				/>
			</div>

			{/* Main content area */}
			<div className="grid gap-6 2xl:grid-cols-3">
				{/* Left column: Document content with comments directly beneath the
				    rich-text fields (full width on mobile-XL, 2/3 on 2XL+) */}
				<div className="min-w-0 2xl:col-span-2 space-y-6">
					{children}
					{commentsSection}
				</div>

				{/* Right column: Details and Actions (only visible on 2XL+, sticky
				    positioning with scroll) */}
				<div className="hidden 2xl:block">
					<div className="2xl:sticky 2xl:top-20 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto space-y-6">
						<DocumentDetailsSection
							document={document}
							project={project}
							typeSpecificId={typeSpecificId}
						/>
						<DocumentActionsSectionWithModals
							document={document}
							project={project}
							members={members}
							documentType={compactDocumentType}
							canDelete={canDelete}
							locked={locked}
							creator={creator}
							userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
							userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
							userIsCaretakerOfProjectLeader={userIsCaretakerOfProjectLeader}
							all_documents={all_documents}
							isBaLead={isBaLead}
							onCreateConceptPlan={onCreateConceptPlan}
							onCreateProgressReport={onCreateProgressReport}
							onSetAreas={onSetAreas}
							onReopenProject={onReopenProject}
						/>
					</div>
				</div>
			</div>
		</div>
	);
};
