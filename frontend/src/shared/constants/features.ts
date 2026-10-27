/**
 * Feature flags and configuration constants
 *
 * These constants control optional features and behaviours across the application.
 */

/**
 * Enable automatic polling for new comments
 *
 * When enabled, the comment section refetches in the background so comments
 * posted by other users flow in without a hard refresh. Only newly-arrived
 * comments mount and fade in — unchanged comments are preserved by TanStack
 * Query's structural sharing, so the section does not flicker or re-render
 * wholesale. Returning to the tab also triggers an immediate refetch.
 *
 * @default true
 */
export const ENABLE_COMMENT_POLLING = true;

/**
 * Background polling interval for comments, in milliseconds.
 *
 * A balance between feeling live and not hammering the API. New comments
 * appear within this window; switching back to the tab refreshes instantly
 * via refetchOnWindowFocus.
 */
export const COMMENT_POLLING_INTERVAL_MS = 12_000;
