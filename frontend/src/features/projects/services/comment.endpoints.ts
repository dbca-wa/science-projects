/**
 * Comment API Endpoints
 *
 * Endpoint definitions for comment-related API calls.
 */

export const COMMENT_ENDPOINTS = {
	LIST: (documentId: number) =>
		`/communications/comments?document_id=${documentId}&top_level_only=true`,
	DETAIL: (commentId: number) => `/communications/comments/${commentId}`,
	CREATE: () => `/communications/comments`,
	UPDATE: (commentId: number) => `/communications/comments/${commentId}`,
	DELETE: (commentId: number) => `/communications/comments/${commentId}`,
} as const;
