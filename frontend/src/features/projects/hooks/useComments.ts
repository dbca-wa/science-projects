import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	getComments,
	createComment,
	updateComment,
	deleteComment,
} from "../services/comment.service";
import type {
	IComment,
	ICommentCreate,
	ICommentUpdate,
} from "@/shared/types/comment.types";
import {
	ENABLE_COMMENT_POLLING,
	COMMENT_POLLING_INTERVAL_MS,
} from "@/shared/constants/features";
import { logger } from "@/shared/services/logger.service";

/**
 * Document IDs that have been fetched at least once this session. Used only to
 * label the poll log as "loaded" vs "poll" — has no effect on fetching.
 */
const fetchedDocumentIds = new Set<number>();

/**
 * Query keys for comments
 */
export const commentKeys = {
	all: ["comments"] as const,
	lists: () => [...commentKeys.all, "list"] as const,
	list: (documentId: number) => [...commentKeys.lists(), documentId] as const,
	details: () => [...commentKeys.all, "detail"] as const,
	detail: (id: number) => [...commentKeys.details(), id] as const,
};

/**
 * Hook for fetching comments for a document
 * - Only enabled when documentId is provided
 * - When polling is enabled, refetches in the background so comments posted by
 *   other users flow in without a hard refresh. Only new comments mount (and
 *   fade in); unchanged ones are preserved via structural sharing.
 * - Also refetches on window focus and reconnect, so returning to the tab
 *   shows the latest comments immediately.
 *
 * @param documentId - Document ID to fetch comments for
 * @returns TanStack Query result with comments array
 */
export const useComments = (documentId: number | undefined) => {
	return useQuery({
		queryKey: commentKeys.list(documentId as number),
		queryFn: async () => {
			// Distinguish the initial load from background polls so the dev/staging
			// console clearly shows polling is happening. Suppressed in production
			// (logger.debug is a no-op on the prod domain).
			const isInitialLoad = !fetchedDocumentIds.has(documentId as number);
			fetchedDocumentIds.add(documentId as number);

			const result = await getComments(documentId as number);

			if (ENABLE_COMMENT_POLLING) {
				logger.debug(
					isInitialLoad
						? `Comments loaded for document ${documentId} (${result.length})`
						: `Comments poll for document ${documentId} (${result.length}) — every ${COMMENT_POLLING_INTERVAL_MS / 1000}s`,
					{ src: "useComments.ts", documentId, count: result.length }
				);
			}

			return result;
		},
		// Keep stale time below the poll interval so background polls actually
		// fetch rather than serving cache.
		staleTime: ENABLE_COMMENT_POLLING ? COMMENT_POLLING_INTERVAL_MS : 30_000,
		enabled: !!documentId, // Only fetch if documentId is provided
		refetchInterval: ENABLE_COMMENT_POLLING
			? COMMENT_POLLING_INTERVAL_MS
			: false,
		// Pause polling while the tab is hidden to avoid needless requests; the
		// focus refetch below catches up the moment the user returns.
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: ENABLE_COMMENT_POLLING,
		refetchOnReconnect: ENABLE_COMMENT_POLLING,
	});
};

/**
 * Hook for creating a new comment
 * - Invalidates comment list query on success
 * - Shows success/error toast notifications
 *
 * @returns Mutation hook for creating comments
 */
export const useCreateComment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: ICommentCreate) => createComment(data),
		onSuccess: async (newComment: IComment) => {
			// Extract document ID from the document object
			const documentId = newComment.document.id;

			// Invalidate and refetch the comment list
			await queryClient.invalidateQueries({
				queryKey: commentKeys.list(documentId),
				exact: true,
			});

			await queryClient.refetchQueries({
				queryKey: commentKeys.list(documentId),
				exact: true,
			});

			toast.success("Comment posted successfully");
		},
		onError: (error: Error) => {
			console.error("[useCreateComment] Failed to create comment:", error);
			toast.error(error.message || "Failed to post comment");
		},
	});
};

/**
 * Hook for updating an existing comment
 * - Invalidates comment detail and list queries on success
 * - Shows success/error toast notifications
 *
 * @returns Mutation hook for updating comments
 */
export const useUpdateComment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			commentId,
			data,
		}: {
			commentId: number;
			data: ICommentUpdate;
		}) => updateComment(commentId, data),
		onSuccess: async (updatedComment: IComment) => {
			// Extract document ID from the document object
			const _documentId = updatedComment.document.id;

			// Invalidate and refetch the comment list
			await queryClient.invalidateQueries({
				queryKey: commentKeys.list(_documentId),
				exact: true,
			});

			await queryClient.refetchQueries({
				queryKey: commentKeys.list(_documentId),
				exact: true,
			});

			toast.success("Comment updated successfully");
		},
		onError: (error: Error) => {
			console.error("[useUpdateComment] Failed to update comment:", error);
			toast.error(error.message || "Failed to update comment");
		},
	});
};

/**
 * Hook for deleting a comment (soft delete)
 * - Invalidates comment list query on success
 * - Shows success/error toast notifications
 *
 * @returns Mutation hook for deleting comments
 */
export const useDeleteComment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			commentId,
			documentId: _documentId,
		}: {
			commentId: number;
			documentId: number;
		}) => deleteComment(commentId),
		onSuccess: async (_data, variables) => {
			// Invalidate and refetch comment list for this document
			await queryClient.invalidateQueries({
				queryKey: commentKeys.list(variables.documentId),
				exact: true,
			});

			await queryClient.refetchQueries({
				queryKey: commentKeys.list(variables.documentId),
				exact: true,
			});

			toast.success("Comment deleted successfully");
		},
		onError: (error: Error) => {
			console.error("[useDeleteComment] Failed to delete comment:", error);
			toast.error(error.message || "Failed to delete comment");
		},
	});
};
