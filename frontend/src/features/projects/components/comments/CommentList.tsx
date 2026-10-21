import { useState, useEffect } from "react";
import { useLocation } from "react-router";
import { CommentThread } from "./CommentThread";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { MessageSquare } from "lucide-react";
import type { IComment } from "@/shared/types/comment.types";
import type { IFullProjectDetails } from "@/shared/types/project.types";

interface CommentListProps {
	comments: IComment[];
	projectId: number;
	isLoading?: boolean;
	error?: Error | null;
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
	canComment: boolean;
	project: IFullProjectDetails | null | undefined;
}

/**
 * CommentList Component
 *
 * Displays a list of comments with threaded replies.
 * Shows loading and error states.
 * Shows empty state when no comments exist.
 * Only displays top-level comments - replies are shown within CommentThread.
 * Supports anchor links for deep linking to specific comments.
 */
export const CommentList = ({
	comments,
	projectId,
	isLoading = false,
	error = null,
	onEdit,
	onUpdate,
	onDelete,
	onReply,
	editingCommentId = null,
	onCancelEdit,
	canComment,
	project,
}: CommentListProps) => {
	const location = useLocation();
	const [highlightedCommentId, setHighlightedCommentId] = useState<
		number | null
	>(null);

	// Detect comment anchor from URL hash
	useEffect(() => {
		const hash = location.hash;
		if (hash.startsWith("#comment-")) {
			const commentId = parseInt(hash.replace("#comment-", ""), 10);
			if (!isNaN(commentId)) {
				// Use setTimeout to avoid synchronous setState in effect
				const highlightTimer = setTimeout(() => {
					setHighlightedCommentId(commentId);
				}, 0);

				// Remove highlight after 3 seconds
				const clearTimer = setTimeout(() => {
					setHighlightedCommentId(null);
				}, 3000);

				return () => {
					clearTimeout(highlightTimer);
					clearTimeout(clearTimer);
				};
			}
		}
	}, [location.hash]);
	// Loading state
	if (isLoading) {
		return <LoadingSkeleton count={3} />;
	}

	// Error state
	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>
					Failed to load comments. Please try again later.
				</AlertDescription>
			</Alert>
		);
	}

	// Empty state
	if (comments.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-center">
				<MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
				<p className="text-sm text-muted-foreground">
					No comments yet. Be the first to comment!
				</p>
			</div>
		);
	}

	// The response is already roots-only; replies render within CommentThread
	return (
		<div className="space-y-4">
			{comments.map((comment) => (
				<CommentThread
					key={comment.id}
					comment={comment}
					projectId={projectId}
					onEdit={onEdit}
					onUpdate={onUpdate}
					onDelete={onDelete}
					onReply={onReply}
					editingCommentId={editingCommentId}
					onCancelEdit={onCancelEdit}
					highlightedCommentId={highlightedCommentId}
					canComment={canComment}
					project={project}
				/>
			))}
		</div>
	);
};
