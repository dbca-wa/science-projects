import { useState } from "react";
import type { IProjectClosure } from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectMember,
	IProjectDocuments,
} from "@/shared/types/project.types";
import type { IUserData } from "@/shared/types/user.types";
import { useCurrentUser } from "@/features/auth";
import { calculateDocumentEditPermission } from "@/features/projects/utils/permissions";
import {
	isRichTextLocked,
	getEffectiveCanEdit,
	getLockedMessage,
} from "@/shared/utils/document-locking.utils";
import { DocumentTabLayout } from "@/shared/components/documents";
import { InlineSaveEditor } from "@/shared/components/editor";
import { ProjectSection } from "@/shared/components/ProjectSection";
import { ReopenProjectModal } from "../modals/ReopenProjectModal";
import { ManageEditExceptionsModal } from "../modals/ManageEditExceptionsModal";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Label } from "@/shared/components/ui/label";
import { Lock, LockOpen } from "lucide-react";
import { useUpdateContent } from "@/shared/hooks/queries/useUpdateContent";
import { CommentSection } from "@/features/projects/components/comments";

interface ProjectClosureTabProps {
	projectClosure: IProjectClosure | null;
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

export function ProjectClosureTab({
	projectClosure,
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
}: ProjectClosureTabProps) {
	// Modal state for reopen project action
	const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
	const [isManageAccessModalOpen, setIsManageAccessModalOpen] = useState(false);
	const { data: currentUser } = useCurrentUser();

	// Update mutation for intended_outcome
	const updateIntendedOutcome = useUpdateContent({
		contentType: "project-closure-intended-outcome",
		entityId: projectClosure?.id || 0,
	});

	if (!projectClosure) {
		return (
			<div className="rounded-lg border bg-card p-6">
				<p className="text-muted-foreground">No project closure available.</p>
			</div>
		);
	}

	const canEditBase = calculateDocumentEditPermission({
		currentUser,
		members,
		document: projectClosure.document,
		isBaLead,
		userIsCaretakerOfBaLeader,
		userIsCaretakerOfAdmin,
	});

	// Lock rich text editing when document is fully approved
	const isLocked = isRichTextLocked(projectClosure.document);
	const hasActiveException =
		projectClosure.document.current_user_has_edit_exception ?? false;
	const canEdit = getEffectiveCanEdit(
		canEditBase,
		projectClosure.document,
		false,
		currentUser?.is_superuser,
		hasActiveException
	);
	const lockedMessage = getLockedMessage(
		projectClosure.document,
		isLocked,
		undefined,
		hasActiveException
	);

	// Handle intended outcome change
	const handleIntendedOutcomeChange = (value: string) => {
		updateIntendedOutcome.mutate(value);
	};

	return (
		<>
			<DocumentTabLayout
				document={projectClosure.document}
				project={project}
				members={members}
				documentType="project_closure"
				typeSpecificId={projectClosure.id}
				canDelete={!isLocked}
				locked={isLocked}
				creator={creator}
				modifier={modifier}
				userIsCaretakerOfAdmin={userIsCaretakerOfAdmin}
				userIsCaretakerOfBaLeader={userIsCaretakerOfBaLeader}
				userIsCaretakerOfProjectLeader={userIsCaretakerOfProjectLeader}
				all_documents={all_documents}
				isBaLead={isBaLead}
				onReopenProject={() => setIsReopenModalOpen(true)}
				commentsSection={
					<CommentSection
						documentId={projectClosure.document.id}
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
										: "This document is locked because it has been fully approved. Content can still be copied."}
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

					{/* Intended Outcome - SELECT component */}
					<div className="bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
						<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
							<Label
								htmlFor="intended-outcome"
								className="text-lg font-semibold"
							>
								Select an Intended Outcome:
							</Label>
						</div>
						<div className="px-6 py-5">
							<Select
								value={projectClosure.intended_outcome || "completed"}
								onValueChange={handleIntendedOutcomeChange}
								disabled={!canEdit || updateIntendedOutcome.isPending}
							>
								<SelectTrigger id="intended-outcome" className="w-full">
									<SelectValue placeholder="Select intended outcome" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="completed">Completed</SelectItem>
									<SelectItem value="terminated">Terminated</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Reason */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-reason"
							entityId={projectClosure.id}
							initialContent={projectClosure.reason || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Reason"
						/>
					</ProjectSection>

					{/* Knowledge Transfer */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-knowledge-transfer"
							entityId={projectClosure.id}
							initialContent={projectClosure.knowledge_transfer || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Knowledge Transfer"
						/>
					</ProjectSection>

					{/* Data Location */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-data-location"
							entityId={projectClosure.id}
							initialContent={projectClosure.data_location || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Data Location"
						/>
					</ProjectSection>

					{/* Hardcopy Location */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-hardcopy-location"
							entityId={projectClosure.id}
							initialContent={projectClosure.hardcopy_location || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Hardcopy Location"
						/>
					</ProjectSection>

					{/* Backup Location */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-backup-location"
							entityId={projectClosure.id}
							initialContent={projectClosure.backup_location || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Backup Location"
						/>
					</ProjectSection>

					{/* Scientific Outputs */}
					<ProjectSection>
						<InlineSaveEditor
							contentType="project-closure-scientific-outputs"
							entityId={projectClosure.id}
							initialContent={projectClosure.scientific_outputs || ""}
							canEdit={canEdit}
							lockedMessage={lockedMessage}
							label="Scientific Outputs"
						/>
					</ProjectSection>
				</div>
			</DocumentTabLayout>

			{/* Reopen Project Modal */}
			{currentUser?.is_superuser && (
				<ManageEditExceptionsModal
					isOpen={isManageAccessModalOpen}
					onClose={() => setIsManageAccessModalOpen(false)}
					documentId={projectClosure.document.id}
					projectId={project.id}
				/>
			)}

			<ReopenProjectModal
				isOpen={isReopenModalOpen}
				onClose={() => setIsReopenModalOpen(false)}
				projectId={project.id}
			/>
		</>
	);
}
