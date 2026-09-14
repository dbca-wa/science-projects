import { useState } from "react";
import type { IProjectPlan } from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectMember,
	IProjectDocuments,
} from "@/shared/types/project.types";
import type { IUserData } from "@/shared/types/user.types";
import { useCurrentUser } from "@/features/auth";
import { calculateDocumentEditPermission } from "@/features/projects/utils/permissions";
import {
	isProjectPlanLocked,
	isReportCreationLocked,
	getEffectiveCanEdit,
	getLockedMessage,
} from "@/shared/utils/document-locking.utils";
import { DocumentTabLayout } from "@/shared/components/documents";
import { InlineSaveEditor } from "@/shared/components/editor";
import { ProjectSection } from "@/shared/components/ProjectSection";
import { SetAreasModal } from "@/features/projects/components/modals/SetAreasModal";
import { CreateProgressReportModal } from "@/features/projects/components/modals/CreateProgressReportModal";
import { ManageEditExceptionsModal } from "@/features/projects/components/modals/ManageEditExceptionsModal";
import { MethodologyImage } from "@/features/projects/components/MethodologyImage";
import { ProjectPlanEndorsements } from "@/features/projects/components/ProjectPlanEndorsements";
import { CommentSection } from "@/features/projects/components/comments";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { CheckCircle, Plus, Lock, LockOpen } from "lucide-react";

interface ProjectPlanTabProps {
	projectPlan: IProjectPlan | null;
	project: IProjectData;
	members: IProjectMember[] | null;
	projectId: number;
	hasProgressReports: boolean;
	// New props for DocumentActionsSection
	creator?: IUserData | null;
	modifier?: IUserData | null;
	userIsCaretakerOfAdmin?: boolean;
	userIsCaretakerOfBaLeader?: boolean;
	userIsCaretakerOfProjectLeader?: boolean;
	all_documents?: IProjectDocuments;
	isBaLead?: boolean;
	userData?: IUserData | null;
}

export const ProjectPlanTab = ({
	projectPlan,
	project,
	members,
	projectId,
	hasProgressReports: _hasProgressReports,
	creator,
	modifier,
	userIsCaretakerOfAdmin,
	userIsCaretakerOfBaLeader,
	userIsCaretakerOfProjectLeader,
	all_documents,
	isBaLead,
	userData,
}: ProjectPlanTabProps) => {
	// Modal state for special actions
	const [isSetAreasModalOpen, setIsSetAreasModalOpen] = useState(false);
	const [isCreateReportModalOpen, setIsCreateReportModalOpen] = useState(false);
	const [isManageAccessModalOpen, setIsManageAccessModalOpen] = useState(false);
	const { data: currentUser } = useCurrentUser();

	if (!projectPlan) {
		return (
			<div className="rounded-lg border bg-card p-6">
				<p className="text-muted-foreground">No project plan available.</p>
			</div>
		);
	}

	const canEditBase = calculateDocumentEditPermission({
		currentUser,
		members,
		document: projectPlan.document,
		isBaLead,
		userIsCaretakerOfBaLeader,
		userIsCaretakerOfAdmin,
	});

	// Lock editing if project plan is approved and progress reports exist
	const isLocked = isProjectPlanLocked(projectPlan.document, all_documents);
	const hasActiveException =
		projectPlan.document.current_user_has_edit_exception ?? false;
	const canEdit = getEffectiveCanEdit(
		canEditBase,
		projectPlan.document,
		isLocked,
		currentUser?.is_superuser,
		hasActiveException
	);

	// Lock report creation if project is terminated/completed or has approved closure
	const isCreationLocked = isReportCreationLocked(project, all_documents);
	const lockedMessage = getLockedMessage(
		projectPlan.document,
		isLocked,
		undefined,
		hasActiveException
	);

	return (
		<>
			<DocumentTabLayout
				document={projectPlan.document}
				project={project}
				members={members}
				documentType="project_plan"
				typeSpecificId={projectPlan.id}
				canDelete={!isLocked}
				locked={isLocked}
				creator={creator}
				modifier={modifier}
				userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
				userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
				userIsCaretakerOfProjectLeader={userIsCaretakerOfProjectLeader}
				all_documents={all_documents}
				isBaLead={isBaLead}
				onSetAreas={() => setIsSetAreasModalOpen(true)}
				onCreateProgressReport={() => setIsCreateReportModalOpen(true)}
				commentsSection={
					<CommentSection
						documentId={projectPlan.document.id}
						projectId={projectId}
					/>
				}
			>
				<div className="space-y-6">
					{/* Locked banner */}
					{isLocked && (
						<Alert
							className={
								hasActiveException
									? "border-amber-400 dark:border-amber-600 bg-amber-100 dark:bg-amber-950/40"
									: "border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800"
							}
						>
							{hasActiveException ? (
								<LockOpen className="size-4 text-amber-600 dark:text-amber-400" />
							) : (
								<Lock className="size-4 text-gray-500 dark:text-gray-400" />
							)}
							<AlertDescription
								className={`flex items-center justify-between gap-4 ${
									hasActiveException
										? "font-medium text-amber-800 dark:text-amber-200"
										: "text-gray-600 dark:text-gray-400"
								}`}
							>
								<span>
									{hasActiveException
										? "You have temporary access to edit this locked document."
										: "This document is locked to preserve data integrity. The project has progressed past this stage."}
								</span>
								{currentUser?.is_superuser && (
									<Button
										size="sm"
										variant="outline"
										className="shrink-0"
										onClick={() => setIsManageAccessModalOpen(true)}
									>
										Manage edit access
									</Button>
								)}
							</AlertDescription>
						</Alert>
					)}

					{/* Post-approval banner: project plan approved */}
					{projectPlan.document.status === "approved" && (
						<Alert className="border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30">
							<CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
							<AlertDescription className="flex items-center justify-between gap-4">
								<span className="text-emerald-800 dark:text-emerald-200">
									{isCreationLocked
										? "This project plan has been fully approved. Report creation is locked because the project has been closed."
										: "This project plan has been fully approved. You can now create progress reports."}
								</span>
								<Button
									size="sm"
									className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
									onClick={() => setIsCreateReportModalOpen(true)}
									disabled={isCreationLocked}
								>
									<Plus className="mr-1.5 size-3.5" />
									Create Progress Report
								</Button>
							</AlertDescription>
						</Alert>
					)}

					{/* Endorsements - FIRST SECTION */}
					{projectPlan.endorsements && (
						<ProjectPlanEndorsements
							projectPlan={projectPlan}
							userData={userData ?? null}
							members={members}
							isBaLead={isBaLead}
							userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
							userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
						/>
					)}

					{/* Background */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-background"
							entityId={projectPlan.id}
							initialContent={projectPlan.background || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Background"
						/>
					</ProjectSection>

					{/* Aims */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-aims"
							entityId={projectPlan.id}
							initialContent={projectPlan.aims || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Aims"
						/>
					</ProjectSection>

					{/* Expected Outcomes */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-outcome"
							entityId={projectPlan.id}
							initialContent={projectPlan.outcome || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Expected Outcomes"
						/>
					</ProjectSection>

					{/* Knowledge Transfer */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-knowledge-transfer"
							entityId={projectPlan.id}
							initialContent={projectPlan.knowledge_transfer || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Knowledge Transfer"
						/>
					</ProjectSection>

					{/* Project Tasks */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-project-tasks"
							entityId={projectPlan.id}
							initialContent={projectPlan.project_tasks || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Project Tasks"
						/>
					</ProjectSection>

					{/* Methodology */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-methodology"
							entityId={projectPlan.id}
							initialContent={projectPlan.methodology || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Methodology"
						/>
					</ProjectSection>

					{/* Methodology Image */}
					<ProjectSection>
						<MethodologyImage
							methodologyImage={projectPlan.methodology_image}
							projectPlanId={projectPlan.id}
							canEdit={canEdit}
						/>
					</ProjectSection>

					{/* Number of Voucher Specimens */}
					{projectPlan.endorsements && (
						<ProjectSection>
							<InlineSaveEditor
								contentType="project-plan-specimens"
								entityId={projectPlan.endorsements.id}
								initialContent={projectPlan.endorsements.no_specimens || ""}
								canEdit={canEdit}
								lockedMessage={lockedMessage}
								label="Number of Voucher Specimens"
							/>
						</ProjectSection>
					)}

					{/* Data Management */}
					{projectPlan.endorsements && (
						<ProjectSection>
							<InlineSaveEditor
								contentType="project-plan-data-management"
								entityId={projectPlan.endorsements.id}
								initialContent={projectPlan.endorsements.data_management || ""}
								canEdit={canEdit}
								lockedMessage={lockedMessage}
								label="Data Management"
							/>
						</ProjectSection>
					)}

					{/* Related Science Projects */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-related-projects"
							entityId={projectPlan.id}
							initialContent={projectPlan.related_projects || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Related Science Projects"
						/>
					</ProjectSection>

					{/* Consolidated Funds */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-operating-budget"
							entityId={projectPlan.id}
							initialContent={projectPlan.operating_budget || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Consolidated Funds"
						/>
					</ProjectSection>

					{/* External Funds */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-operating-budget-external"
							entityId={projectPlan.id}
							initialContent={projectPlan.operating_budget_external || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="External Funds"
						/>
					</ProjectSection>

					{/* Listed References */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-plan-listed-references"
							entityId={projectPlan.id}
							initialContent={projectPlan.listed_references || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Listed References"
						/>
					</ProjectSection>
				</div>
			</DocumentTabLayout>

			{/* Special action modals for Project Plan */}
			<SetAreasModal
				isOpen={isSetAreasModalOpen}
				onClose={() => setIsSetAreasModalOpen(false)}
				project={project}
				currentAreas={project.areas || []}
			/>

			<CreateProgressReportModal
				isOpen={isCreateReportModalOpen}
				onClose={() => setIsCreateReportModalOpen(false)}
				project={project}
			/>

			{currentUser?.is_superuser && (
				<ManageEditExceptionsModal
					isOpen={isManageAccessModalOpen}
					onClose={() => setIsManageAccessModalOpen(false)}
					documentId={projectPlan.document.id}
					projectId={projectId}
				/>
			)}
		</>
	);
};
