import type { IConceptPlan } from "@/shared/types/document.types";
import { useState } from "react";
import type {
	IProjectData,
	IProjectMember,
	IProjectDocuments,
} from "@/shared/types/project.types";
import type { IUserData } from "@/shared/types/user.types";
import { useCurrentUser } from "@/features/auth";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/services/api/client.service";
import { toast } from "sonner";
import { calculateDocumentEditPermission } from "@/features/projects/utils/permissions";
import {
	isConceptPlanLocked,
	getEffectiveCanEdit,
	getLockedMessage,
} from "@/shared/utils/document-locking.utils";
import { DocumentTabLayout } from "@/shared/components/documents";
import { InlineSaveEditor } from "@/shared/components/editor";
import { ProjectSection } from "@/shared/components/ProjectSection";
import { ManageEditExceptionsModal } from "@/features/projects/components/modals/ManageEditExceptionsModal";
import { CommentSection } from "@/features/projects/components/comments";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
	CheckCircle,
	ArrowRight,
	Plus,
	Loader2,
	Lock,
	LockOpen,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface ConceptPlanTabProps {
	conceptPlan: IConceptPlan | null;
	project: IProjectData;
	members: IProjectMember[] | null;
	projectId: number;
	// New props for DocumentActionsSection
	creator?: IUserData | null;
	modifier?: IUserData | null;
	userIsCaretakerOfAdmin?: boolean;
	userIsCaretakerOfBaLeader?: boolean;
	userIsCaretakerOfProjectLeader?: boolean;
	all_documents?: IProjectDocuments;
	isBaLead?: boolean;
}

export const ConceptPlanTab = ({
	conceptPlan,
	project,
	members,
	projectId,
	creator,
	modifier,
	userIsCaretakerOfAdmin,
	userIsCaretakerOfBaLeader,
	userIsCaretakerOfProjectLeader,
	all_documents,
	isBaLead,
}: ConceptPlanTabProps) => {
	const { data: currentUser } = useCurrentUser();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isManageAccessModalOpen, setIsManageAccessModalOpen] = useState(false);

	const createProjectPlanMutation = useMutation({
		mutationFn: async () => {
			return apiClient.post(`documents/create-project-plan/${project.id}`);
		},
		onSuccess: () => {
			toast.success("Project plan created");
			queryClient.invalidateQueries({
				queryKey: ["projects", "detail", project.id],
			});
			navigate(`/projects/${projectId}/project`);
		},
		onError: () => {
			toast.error(
				"Failed to create project plan. It may already exist — try refreshing the page."
			);
			queryClient.invalidateQueries({
				queryKey: ["projects", "detail", project.id],
			});
		},
	});

	if (!conceptPlan) {
		return (
			<div className="rounded-lg border bg-card p-6">
				<p className="text-muted-foreground">No concept plan available.</p>
			</div>
		);
	}

	const canEditBase = calculateDocumentEditPermission({
		currentUser,
		members,
		document: conceptPlan.document,
		isBaLead,
		userIsCaretakerOfBaLeader,
		userIsCaretakerOfAdmin,
	});

	const isApproved = conceptPlan.document.status === "approved";
	const hasProjectPlan = !!all_documents?.project_plan;

	// Lock editing if concept plan is approved and a project plan exists
	const isLocked = isConceptPlanLocked(conceptPlan.document, all_documents);
	const hasActiveException =
		conceptPlan.document.current_user_has_edit_exception ?? false;
	const canEdit = getEffectiveCanEdit(
		canEditBase,
		conceptPlan.document,
		isLocked,
		currentUser?.is_superuser,
		hasActiveException
	);
	const lockedMessage = getLockedMessage(
		conceptPlan.document,
		isLocked,
		undefined,
		hasActiveException
	);

	return (
		<>
			<DocumentTabLayout
				document={conceptPlan.document}
				project={project}
				members={members}
				documentType="concept_plan"
				typeSpecificId={conceptPlan.id}
				canDelete={!isLocked}
				locked={isLocked}
				creator={creator}
				modifier={modifier}
				userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
				userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
				userIsCaretakerOfProjectLeader={userIsCaretakerOfProjectLeader}
				all_documents={all_documents}
				isBaLead={isBaLead}
				commentsSection={
					<CommentSection
						documentId={conceptPlan.document.id}
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

					{/* Post-approval banner: concept plan approved */}
					{isApproved && (
						<Alert
							className={cn(
								hasProjectPlan
									? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30"
									: "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30",
								"items-center"
							)}
						>
							{hasProjectPlan ? (
								<CheckCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
							) : (
								<Plus className="size-4 text-amber-600 dark:text-amber-400" />
							)}
							<AlertDescription className="flex items-center justify-between gap-4">
								<span
									className={
										hasProjectPlan
											? "text-emerald-800 dark:text-emerald-200"
											: "text-amber-800 dark:text-amber-200"
									}
								>
									{hasProjectPlan
										? "This concept plan has been approved. A project plan has been created."
										: "This concept plan has been approved but no project plan exists. Create one to continue the workflow."}
								</span>
								{hasProjectPlan ? (
									<Button
										size="sm"
										variant="outline"
										className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
										onClick={() => navigate(`/projects/${projectId}/project`)}
									>
										View Project Plan
										<ArrowRight className="ml-1.5 size-3.5" />
									</Button>
								) : (
									<Button
										size="sm"
										className="shrink-0 bg-amber-600 text-white hover:bg-amber-700"
										onClick={() => createProjectPlanMutation.mutate()}
										disabled={createProjectPlanMutation.isPending}
									>
										{createProjectPlanMutation.isPending ? (
											<Loader2 className="mr-1.5 size-3.5 animate-spin" />
										) : (
											<Plus className="mr-1.5 size-3.5" />
										)}
										Create Project Plan
									</Button>
								)}
							</AlertDescription>
						</Alert>
					)}

					{/* Background */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-background"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.background || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Background"
						/>
					</ProjectSection>

					{/* Aims */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-aims"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.aims || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Aims"
						/>
					</ProjectSection>

					{/* Expected Outcomes */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-outcome"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.outcome || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Expected Outcomes"
						/>
					</ProjectSection>

					{/* Collaborations */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-collaborations"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.collaborations || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Collaborations"
						/>
					</ProjectSection>

					{/* Strategic Context */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-strategic-context"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.strategic_context || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Strategic Context"
						/>
					</ProjectSection>

					{/* Staff Time Allocation (FTE) */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-staff-time-allocation"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.staff_time_allocation || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Staff Time Allocation (FTE)"
						/>
					</ProjectSection>

					{/* Indicative Operating Budget ($) */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="concept-plan-budget"
							entityId={conceptPlan.id}
							initialContent={conceptPlan.budget || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							wordLimit={500}
							showWordLimitInLabel={true}
							label="Indicative Operating Budget ($)"
						/>
					</ProjectSection>
				</div>
			</DocumentTabLayout>
			{currentUser?.is_superuser && (
				<ManageEditExceptionsModal
					isOpen={isManageAccessModalOpen}
					onClose={() => setIsManageAccessModalOpen(false)}
					documentId={conceptPlan.document.id}
					projectId={projectId}
				/>
			)}
		</>
	);
};
