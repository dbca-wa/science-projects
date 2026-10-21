import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CommentCard } from "./CommentCard";
import { Button } from "@/shared/components/ui/button";
import type { IComment } from "@/shared/types/comment.types";
import type { IFullProjectDetails } from "@/shared/types/project.types";

interface CommentThreadProps {
	comment: IComment;
	projectId: number;
	onEdit?: (commentId: number) => void;
	onUpdate?: (
		commentId: number,
		text: string,
		mentionedUserIds?: number[]
	) => Promise<void>;
	onDelete?: (commentId: number) => void;
	onReply?: (parentCommentId: number) => void;
	editingCommentId?: number | null;
	onCancelEdit?: () => void;
	highlightedCommentId?: number | null;
	canComment: boolean;
	project: IFullProjectDetails | null | undefined;
}

/**
 * CommentThread Component
 *
 * Displays a parent comment with collapsible nested replies.
 * Shows reply count badge and toggle button for expanding/collapsing replies.
 * Visually indents nested replies (max 3 levels).
 * Supports highlighting specific comments from anchor links.
 */
export const CommentThread = ({
	comment,
	projectId,
	onEdit,
	onUpdate,
	onDelete,
	onReply,
	editingCommentId = null,
	onCancelEdit,
	highlightedCommentId = null,
	canComment,
	project,
}: CommentThreadProps) => {
	// Check if comment has replies
	const hasReplies = comment.has_replies && comment.reply_count > 0;

	// Check if this comment or any reply is highlighted
	const isCommentHighlighted = highlightedCommentId === comment.id;
	const hasHighlightedReply = comment.replies?.some(
		(reply) => reply.id === highlightedCommentId
	);

	// Initialise expanded state - auto-expand if a reply is highlighted
	const [isExpanded, setIsExpanded] = useState(hasHighlightedReply || false);

	// Auto-expand when a new reply arrives so the posted reply is visible
	// without a manual expand
	const prevReplyCountRef = useRef(comment.reply_count);
	useEffect(() => {
		if (comment.reply_count > prevReplyCountRef.current) {
			setIsExpanded(true);
		}
		prevReplyCountRef.current = comment.reply_count;
	}, [comment.reply_count]);

	return (
		<div className="space-y-4">
			{/* Parent Comment */}
			<CommentCard
				comment={comment}
				projectId={projectId}
				onEdit={onEdit}
				onUpdate={onUpdate}
				onDelete={onDelete}
				onReply={onReply}
				isEditing={editingCommentId === comment.id}
				onCancelEdit={onCancelEdit}
				isHighlighted={isCommentHighlighted}
				canComment={canComment}
				project={project}
			/>

			{/* Replies Section */}
			{hasReplies && (
				<div className="ml-8 space-y-4">
					{/* Toggle Button */}
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsExpanded(!isExpanded)}
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						{isExpanded ? (
							<>
								<ChevronDown className="h-4 w-4 mr-1" />
								Hide {comment.reply_count}{" "}
								{comment.reply_count === 1 ? "reply" : "replies"}
							</>
						) : (
							<>
								<ChevronRight className="h-4 w-4 mr-1" />
								Show {comment.reply_count}{" "}
								{comment.reply_count === 1 ? "reply" : "replies"}
							</>
						)}
					</Button>

					{/* Nested Replies */}
					{isExpanded && comment.replies && (
						<div className="space-y-4 border-l-2 border-muted pl-4">
							{comment.replies.map((reply) => (
								<CommentCard
									key={reply.id}
									comment={reply}
									projectId={projectId}
									onEdit={onEdit}
									onUpdate={onUpdate}
									onDelete={onDelete}
									onReply={onReply}
									isEditing={editingCommentId === reply.id}
									onCancelEdit={onCancelEdit}
									replyingToName={
										reply.parent_comment === comment.id
											? undefined
											: (reply.parent_author_name ?? undefined)
									}
									isHighlighted={highlightedCommentId === reply.id}
									canComment={canComment}
									project={project}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
