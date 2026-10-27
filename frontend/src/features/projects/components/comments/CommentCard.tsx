import { useState, useEffect, useRef } from "react";
import { Pencil, Trash2, Reply, Check, X, CornerDownRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser } from "@/features/auth";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { formatRelativeTime } from "@/shared/utils/date.utils";
import { getImageUrl } from "@/shared/utils/image.utils";
import { getUserDisplayName } from "@/shared/utils/user.utils";
import { extractTextFromHTML } from "@/shared/utils/html-display.utils";
import { CommentRichTextDisplay } from "./CommentRichTextDisplay";
import { CommentRichTextEditor } from "./CommentRichTextEditor";
import { ReactionPicker } from "./ReactionPicker";
import { ReactionDisplay } from "./ReactionDisplay";
import { EditTooltip } from "./EditTooltip";
import { TimestampTooltip } from "./TimestampTooltip";
import { UserLink } from "@/shared/components/user";
import {
	useReactions,
	useToggleReaction,
} from "@/features/projects/hooks/useReactions";
import { fadeInVariants } from "@/shared/config/animations";
import {
	canUserEditComment,
	canUserDeleteComment,
} from "@/features/projects/utils/permissions/comment-permissions.utils";
import type { IComment, ReactionType } from "@/shared/types/comment.types";
import type { IFullProjectDetails } from "@/shared/types/project.types";

interface CommentCardProps {
	comment: IComment;
	projectId: number;
	project: IFullProjectDetails | null | undefined;
	canComment: boolean;
	onEdit?: (commentId: number) => void;
	onUpdate?: (
		commentId: number,
		text: string,
		mentionedUserIds?: number[]
	) => Promise<void>;
	onDelete?: (commentId: number) => void;
	onReply?: (parentCommentId: number) => void;
	replyingToName?: string;
	isHighlighted?: boolean;
	isEditing?: boolean;
	onCancelEdit?: () => void;
}

/**
 * CommentCard Component
 *
 * Displays a single comment with user info, content, and actions.
 * Shows edit/delete buttons for comment author.
 * Handles soft-deleted comments with placeholder text.
 * Supports anchor links for deep linking to specific comments.
 * Supports inline editing when isEditing is true.
 */
export const CommentCard = ({
	comment,
	projectId,
	project,
	canComment,
	onEdit,
	onUpdate,
	onDelete,
	onReply,
	replyingToName,
	isHighlighted = false,
	isEditing = false,
	onCancelEdit,
}: CommentCardProps) => {
	const { data: currentUser } = useCurrentUser();
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [editedText, setEditedText] = useState(comment.text);
	const [mentionedUserIds, setMentionedUserIds] = useState<number[]>([]);
	const [isSaving, setIsSaving] = useState(false);

	// Validation for edited text
	const isEditedTextEmpty = extractTextFromHTML(editedText).trim().length === 0;
	const cardRef = useRef<HTMLDivElement>(null);

	// Fetch reactions for this comment
	const { data: reactions = [] } = useReactions(comment.id);
	const toggleReactionMutation = useToggleReaction(comment.id);

	// Calculate permissions
	const canEdit = canUserEditComment(currentUser, comment, project);
	const canDelete = canUserDeleteComment(currentUser, comment);

	// Check if current user has any reaction (for hiding reaction picker)
	const userHasReaction = reactions.some((r) => r.user.id === currentUser?.id);

	// Find current user's reaction type (if any) - for passing to ReactionPicker
	const currentUserReaction =
		reactions.find((r) => r.user.id === currentUser?.id)?.reaction || null;

	// Check if current user is the comment author
	const isAuthor = currentUser?.id === comment.user?.id;

	// Check if comment was edited
	// Use a threshold of 5 seconds to account for database timing and auto_now quirks
	// Django's auto_now=True can update timestamps even on non-edit saves
	const isEdited =
		comment.updated_at &&
		comment.created_at &&
		new Date(comment.updated_at).getTime() -
			new Date(comment.created_at).getTime() >
			5000;

	// Generate anchor ID for this comment
	const anchorId = `comment-${comment.id}`;

	// Scroll to comment if highlighted (from URL hash)
	useEffect(() => {
		if (isHighlighted && cardRef.current) {
			// Small delay to ensure DOM is ready
			setTimeout(() => {
				cardRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}, 100);
		}
	}, [isHighlighted]);

	// Get user initials from display names
	const getInitials = (user: typeof comment.user) => {
		if (!user) return "?";
		const firstInitial = user.display_first_name?.[0] || "";
		const lastInitial = user.display_last_name?.[0] || "";
		return `${firstInitial}${lastInitial}`.toUpperCase() || "?";
	};

	// Handle delete confirmation
	const handleDeleteConfirm = () => {
		onDelete?.(comment.id);
		setIsDeleteDialogOpen(false);
	};

	// Handle reaction selection
	const handleReactionSelect = (reactionType: ReactionType) => {
		toggleReactionMutation.mutate(reactionType);
	};

	// Handle save edited comment
	const handleSaveEdit = async () => {
		if (!onUpdate) return;

		setIsSaving(true);
		try {
			await onUpdate(comment.id, editedText, mentionedUserIds);
		} catch (error) {
			console.error("Failed to save comment:", error);
		} finally {
			setIsSaving(false);
		}
	};

	// Handle cancel edit
	const handleCancelEdit = () => {
		setEditedText(comment.text);
		setMentionedUserIds([]);
		onCancelEdit?.();
	};

	// Handle comments with null user (data integrity issue)
	if (!comment.user) {
		console.error(`Comment ${comment.id} has no user - data integrity issue`);
		return (
			<div
				id={anchorId}
				ref={cardRef}
				className="mb-4 p-4 rounded-lg bg-background border opacity-60"
			>
				<div className="flex gap-4 items-start">
					<Avatar className="size-24 flex-shrink-0">
						<AvatarFallback className="bg-muted">
							<span className="text-xs text-muted-foreground">?</span>
						</AvatarFallback>
					</Avatar>
					<div className="flex-1">
						<p className="text-sm text-muted-foreground italic">
							[Comment data error - missing user]
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Handle soft-deleted comments
	if (comment.is_removed) {
		return (
			<div
				id={anchorId}
				ref={cardRef}
				className="mb-4 p-4 rounded-lg bg-background border opacity-60"
			>
				<div className="flex gap-4 items-start">
					<Avatar className="size-24 flex-shrink-0">
						<AvatarFallback className="bg-muted">
							<span className="text-xs text-muted-foreground">?</span>
						</AvatarFallback>
					</Avatar>
					<div className="flex-1">
						<p className="text-sm text-muted-foreground italic">
							[Comment deleted]
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<>
			<motion.div initial="hidden" animate="visible" variants={fadeInVariants}>
				<div
					id={anchorId}
					ref={cardRef}
					className={`@container group mb-4 p-4 rounded-3xl bg-background border transition-all duration-500 relative ${
						isHighlighted
							? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20"
							: ""
					}`}
				>
					{/* Reaction counts - always visible in top RHS */}
					{reactions.length > 0 && !isEditing && (
						<div className="absolute top-4 right-4">
							<ReactionDisplay
								reactions={reactions}
								currentUserId={currentUser?.id}
								onReactionToggle={handleReactionSelect}
								canInteract={canComment}
							/>
						</div>
					)}

					{/* Inline reaction picker — appears on card hover in the SAME
					    top-right corner as the reaction badge, so the picker and an
					    existing reaction share one end point. Only shown on wide
					    cards when there are no reactions yet (otherwise the badge
					    occupies this spot); narrow cards use the button picker in
					    the action row below. */}
					{canComment &&
						!isAuthor &&
						!userHasReaction &&
						reactions.length === 0 &&
						!isEditing && (
							<div
								data-testid="inline-reaction-picker-overlay"
								className="absolute top-4 right-4 z-20 hidden @[380px]:group-hover:block rounded-lg border bg-popover p-1 shadow-md"
							>
								<ReactionPicker
									onReactionSelect={handleReactionSelect}
									currentUserReaction={currentUserReaction}
									forceButtonMode={false}
								/>
							</div>
						)}

					<AnimatePresence mode="wait">
						{isEditing ? (
							/* Edit Mode - Full width editor without avatar/metadata */
							<motion.div
								key="edit-mode"
								initial={{ opacity: 0, scale: 0.98 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.98 }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="space-y-2"
							>
								<CommentRichTextEditor
									key={`edit-${comment.id}`}
									value={editedText}
									onChange={setEditedText}
									onMentionedUsersChange={setMentionedUserIds}
									projectId={projectId}
									placeholder="Edit your comment..."
									disabled={isSaving}
									autoFocus={true}
									minHeight="80px"
									currentUser={currentUser}
									initialHtml={comment.text}
								/>
								<div className="flex gap-2 justify-end">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={handleCancelEdit}
										disabled={isSaving}
									>
										<X className="h-3 w-3 mr-1" />
										Cancel
									</Button>
									<Button
										type="button"
										size="sm"
										onClick={handleSaveEdit}
										disabled={isSaving || isEditedTextEmpty}
									>
										<Check className="h-3 w-3 mr-1" />
										Save
									</Button>
								</div>
							</motion.div>
						) : (
							/* Display Mode - Normal layout with avatar and metadata */
							<motion.div
								key="display-mode"
								initial={{ opacity: 0, scale: 0.98 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.98 }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="flex gap-4 items-start group"
							>
								{/* User Avatar - Responsive: 64px on narrow, 96px on wide */}
								<Avatar className="size-16 @[380px]:size-24 flex-shrink-0">
									<AvatarImage
										src={getImageUrl(comment.user.image)}
										alt={getInitials(comment.user)}
									/>
									<AvatarFallback className="text-base @[380px]:text-xl font-bold">
										{getInitials(comment.user)}
									</AvatarFallback>
								</Avatar>

								<div className="flex-1 min-w-0 pt-2">
									{/* User Name and Timestamp */}
									<div className="flex items-center gap-2 mb-1 flex-wrap">
										<UserLink
											userId={comment.user.id}
											displayName={getUserDisplayName(comment.user)}
										/>
										<TimestampTooltip timestamp={comment.created_at}>
											{formatRelativeTime(comment.created_at)}
										</TimestampTooltip>
										{isEdited && <EditTooltip editedAt={comment.updated_at} />}
									</div>

									{/* Reply reference line */}
									{replyingToName && (
										<div className="flex items-center gap-1 mb-1 text-xs text-muted-foreground">
											<CornerDownRight className="h-3 w-3" />
											<span>Replying to {replyingToName}</span>
										</div>
									)}

									{/* Comment Content */}
									<div className="text-sm mb-2">
										<CommentRichTextDisplay html={comment.text} />
									</div>

									{/* Action Buttons - Bottom with ReactionPicker next to Reply */}
									<div className="flex justify-end gap-2 items-center">
										{/* Narrow cards (<380px): always-visible button picker in the
										    action row. Wide cards use the hover picker anchored to the
										    top-right corner (rendered above, matching the reaction
										    badge's position). Hidden for your own comments or when you
										    already have a reaction. */}
										{canComment && !isAuthor && !userHasReaction && (
											<div className="block @[380px]:hidden">
												<ReactionPicker
													onReactionSelect={handleReactionSelect}
													currentUserReaction={currentUserReaction}
													forceButtonMode={true}
												/>
											</div>
										)}

										{/* Reply Button - only show if user can comment */}
										{canComment && onReply && (
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => onReply(comment.id)}
														className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
													>
														<Reply className="h-3 w-3 @[380px]:mr-1" />
														<span className="hidden @[380px]:inline">
															Reply
														</span>
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													<p>Reply to comment</p>
												</TooltipContent>
											</Tooltip>
										)}

										{/* Edit Button - only show if user can edit */}
										{canEdit && (
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => onEdit?.(comment.id)}
														className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
													>
														<Pencil className="h-3 w-3 @[380px]:mr-1" />
														<span className="hidden @[380px]:inline">Edit</span>
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													<p>Edit comment</p>
												</TooltipContent>
											</Tooltip>
										)}

										{/* Delete Button - only show if user can delete */}
										{canDelete && (
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => setIsDeleteDialogOpen(true)}
														className="h-7 px-2 text-xs text-destructive hover:text-destructive"
													>
														<Trash2 className="h-3 w-3 @[380px]:mr-1" />
														<span className="hidden @[380px]:inline">
															Delete
														</span>
													</Button>
												</TooltipTrigger>
												<TooltipContent>
													<p>Delete comment</p>
												</TooltipContent>
											</Tooltip>
										)}
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</motion.div>

			{/* Delete Confirmation Dialog */}
			<AlertDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Comment</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this comment? This action cannot
							be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteConfirm}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
