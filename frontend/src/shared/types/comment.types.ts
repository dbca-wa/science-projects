/**
 * Comment Types
 *
 * Type definitions for the project comments system with mention support and reactions.
 */

import type { ISmallUserWithAvatar } from "./document.types";

/**
 * Minimal document data returned in comments
 * Matches TinyProjectDocumentSerializer from backend
 */
export interface ITinyDocument {
	/** Document ID */
	id: number;
	/** Document kind (e.g., "projectplan", "progressreport") */
	kind: string;
	/** Document status */
	status: string;
	/** When the document was created */
	created_at: string;
	/** When the document was last updated */
	updated_at: string;
}

/**
 * Reaction type choices (5 reactions)
 * Matches backend ReactionChoices
 */
export type ReactionType =
	"thumbup" | "heart" | "funny" | "confused" | "surprised";

/**
 * Reaction on a comment
 */
export interface IReaction {
	/** Unique reaction ID */
	id: number;
	/** User who reacted */
	user: ISmallUserWithAvatar;
	/** Type of reaction */
	reaction: ReactionType;
	/** When the reaction was created */
	created_at: string;
}

/**
 * Grouped reaction data for display
 * Used to show reaction counts and user lists
 */
export interface IGroupedReaction {
	/** Type of reaction */
	type: ReactionType;
	/** Number of users who reacted with this type */
	count: number;
	/** Users who reacted with this type */
	users: ISmallUserWithAvatar[];
	/** Whether the current user has reacted with this type */
	hasCurrentUser: boolean;
}

/**
 * Comment mention
 * Represents a user mentioned using @mention syntax
 */
export interface ICommentMention {
	/** Unique mention ID */
	id: number;
	/** User who was mentioned */
	mentioned_user: ISmallUserWithAvatar;
	/** When the mention was created */
	created_at: string;
}

/**
 * Comment on a project document
 * Full comment data including author, reactions, and mentions
 */
export interface IComment {
	/** Unique comment ID */
	id: number;
	/** Author of the comment */
	user: ISmallUserWithAvatar;
	/** Document this comment belongs to (full object from backend) */
	document: ITinyDocument;
	/** Comment text content (max 1500 characters) */
	text: string;
	/** Parent comment ID for threaded replies (null for top-level comments) */
	parent_comment: number | null;
	/** Display name of the author this reply is addressed to (null when no label is needed) */
	parent_author_name?: string | null;
	/** IP address of commenter */
	ip_address?: string;
	/** Whether comment is public */
	is_public: boolean;
	/** Whether comment is soft-deleted */
	is_removed: boolean;
	/** When the comment was created */
	created_at: string;
	/** When the comment was last updated */
	updated_at: string;
	/** Reactions on this comment */
	reactions: IReaction[];
	/** Mentions in this comment */
	mentions: ICommentMention[];
	/** Direct replies to this comment */
	replies?: IComment[];
	/** Count of direct replies */
	reply_count: number;
	/** Whether this comment has replies */
	has_replies: boolean;
}

/**
 * Data for creating a new comment
 * Payload sent to the API when creating a comment
 */
export interface ICommentCreate {
	/** Document ID to comment on */
	document: number;
	/** Comment text content (max 1500 characters) */
	text: string;
	/** Parent comment ID for replies (optional) */
	parent_comment?: number | null;
	/** Whether comment is public (default: true) */
	is_public?: boolean;
	/** User IDs mentioned in the comment using @mention syntax (optional) */
	mentioned_user_ids?: number[];
}

/**
 * Data for updating an existing comment
 * Payload sent to the API when updating a comment
 */
export interface ICommentUpdate {
	/** Updated comment text content (max 1500 characters) */
	text: string;
	/** Whether comment is public */
	is_public?: boolean;
	/** User IDs mentioned in the comment using @mention syntax (optional) */
	mentioned_user_ids?: number[];
}
