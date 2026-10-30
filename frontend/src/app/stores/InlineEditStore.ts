import { makeObservable, action, computed, observable } from "mobx";
import type { ContentType } from "@/shared/types/inline-edit.types";
import { normaliseHtmlContent } from "@/shared/utils/html-normalise.utils";
import { CONTENT_TYPE_CONFIGS } from "@/shared/config/content-types.config";

/**
 * State for a single editor instance
 */
export interface EditorState {
	// Unique identifier (format: "contentType:entityId")
	identifier: string;

	// Content tracking
	originalContent: string;
	currentContent: string;

	// Change state reported by the editor itself (null until it reports).
	// When set, it overrides the content comparison below so the navigation
	// warning agrees with the editor's Save button.
	reportedHasChanges: boolean | null;

	// DOM reference for scrolling
	elementRef: HTMLElement | null;

	// Metadata
	contentType: ContentType;
	entityId: number;

	// Timestamp for debugging and ordering
	registeredAt: number;
}

/**
 * Store for managing inline edit mode state across the application.
 * Tracks which content items are currently being edited and their content changes.
 */
export class InlineEditStore {
	/**
	 * Map of editor states keyed by identifier
	 */
	private editorStates: Map<string, EditorState> = observable.map();

	/**
	 * Debounce timers for content updates
	 */
	private updateTimers: Map<string, NodeJS.Timeout> = new Map();

	/**
	 * Legacy: Set of content items currently in edit mode
	 * @deprecated Use editorStates instead
	 */
	private activeEdits: Set<string> = observable.set();

	constructor() {
		makeObservable(this, {
			hasUnsavedChanges: computed,
			editorsWithChanges: computed,
			unsavedCount: computed,
			hasActiveEdits: computed,
			registerEditor: action,
			unregisterEditor: action,
			updateCurrentContent: action,
			reportHasChanges: action,
			clearAll: action,
			startEdit: action,
			endEdit: action,
			saveEditor: action,
			discardEditor: action,
			saveAll: action,
			discardAll: action,
			scrollToEditor: action,
			highlightEditor: action,
		});
	}

	/**
	 * Start editing a specific content item
	 * @deprecated Use registerEditor instead
	 */
	startEdit = (contentType: ContentType, entityId: number): void => {
		const key = `${contentType}:${entityId}`;
		this.activeEdits.add(key);
	};

	/**
	 * End editing a specific content item
	 * @deprecated Use unregisterEditor instead
	 */
	endEdit = (contentType: ContentType, entityId: number): void => {
		const key = `${contentType}:${entityId}`;
		this.activeEdits.delete(key);
	};

	/**
	 * Check if a specific content item is being edited
	 */
	isEditing = (contentType: ContentType, entityId: number): boolean => {
		const key = `${contentType}:${entityId}`;
		return this.editorStates.has(key) || this.activeEdits.has(key);
	};

	/**
	 * Check if any content is being edited
	 * @deprecated Use hasUnsavedChanges instead
	 */
	get hasActiveEdits(): boolean {
		return this.editorStates.size > 0 || this.activeEdits.size > 0;
	}

	/**
	 * Clear all active edits (e.g., on navigation)
	 */
	clearAll = (): void => {
		// Clear debounce timers
		for (const timer of this.updateTimers.values()) {
			clearTimeout(timer);
		}
		this.updateTimers.clear();

		// Clear editor states
		this.editorStates.clear();

		// Clear legacy active edits
		this.activeEdits.clear();
	};

	/**
	 * Register an editor when entering edit mode
	 */
	registerEditor = (params: {
		contentType: ContentType;
		entityId: number;
		originalContent: string;
		elementRef: HTMLElement | null;
	}): void => {
		const { contentType, entityId, originalContent, elementRef } = params;
		const identifier = `${contentType}:${entityId}`;

		// Validate parameters
		if (!contentType || entityId === undefined || entityId === null) {
			console.error("Invalid editor registration parameters", params);
			return;
		}

		// Handle duplicate registration - update element ref but preserve content state
		if (this.editorStates.has(identifier)) {
			const existing = this.editorStates.get(identifier)!;
			existing.elementRef = elementRef;
			return;
		}

		// Create new entry
		this.editorStates.set(identifier, {
			identifier,
			originalContent: originalContent || "",
			currentContent: originalContent || "",
			reportedHasChanges: null,
			elementRef,
			contentType,
			entityId,
			registeredAt: Date.now(),
		});
	};

	/**
	 * Update current content for an editor
	 * Updates immediately for change detection, but debounces expensive operations
	 */
	updateCurrentContent = (
		contentType: ContentType,
		entityId: number,
		content: string
	): void => {
		const identifier = `${contentType}:${entityId}`;
		const state = this.editorStates.get(identifier);

		if (!state) {
			console.warn(
				`Cannot update content for unregistered editor: ${identifier}`
			);
			return;
		}

		// Update content immediately for accurate change detection
		state.currentContent = content;

		// Clear existing timer
		const existingTimer = this.updateTimers.get(identifier);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Set new timer for any expensive operations (currently none, but kept for future use)
		const timer = setTimeout(() => {
			this.updateTimers.delete(identifier);
		}, 100);

		this.updateTimers.set(identifier, timer);
	};

	/**
	 * Record whether an editor has unsaved changes, as the editor itself decides.
	 *
	 * Editors that compare against their own serialised baseline report here, so
	 * the navigation warning uses the same rule as their Save button.
	 */
	reportHasChanges = (
		contentType: ContentType,
		entityId: number,
		hasChanges: boolean
	): void => {
		const state = this.editorStates.get(`${contentType}:${entityId}`);
		if (!state) return;
		state.reportedHasChanges = hasChanges;
	};

	/**
	 * Unregister an editor when exiting edit mode
	 */
	unregisterEditor = (contentType: ContentType, entityId: number): void => {
		const identifier = `${contentType}:${entityId}`;

		// Clear debounce timer
		const timer = this.updateTimers.get(identifier);
		if (timer) {
			clearTimeout(timer);
			this.updateTimers.delete(identifier);
		}

		// Remove editor state
		const state = this.editorStates.get(identifier);
		if (state) {
			// Null out element ref to allow garbage collection
			state.elementRef = null;
			this.editorStates.delete(identifier);
		}
	};

	/**
	 * Check if any editor has unsaved changes
	 */
	get hasUnsavedChanges(): boolean {
		for (const state of this.editorStates.values()) {
			if (this.hasChanges(state.contentType, state.entityId)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get all editors with unsaved changes, ordered by registration time
	 */
	get editorsWithChanges(): EditorState[] {
		const editors: EditorState[] = [];

		for (const state of this.editorStates.values()) {
			if (this.hasChanges(state.contentType, state.entityId)) {
				editors.push(state);
			}
		}

		// Sort by registration time (order on page)
		return editors.sort((a, b) => a.registeredAt - b.registeredAt);
	}

	/**
	 * Count of editors with unsaved changes
	 */
	get unsavedCount(): number {
		return this.editorsWithChanges.length;
	}

	/**
	 * Check if a specific editor has unsaved changes
	 */
	hasChanges = (contentType: ContentType, entityId: number): boolean => {
		const identifier = `${contentType}:${entityId}`;
		const state = this.editorStates.get(identifier);

		if (!state) return false;

		// The editor's own decision wins when it has reported one
		if (state.reportedHasChanges !== null) {
			return state.reportedHasChanges;
		}

		// Normalise both contents before comparison to ignore insignificant whitespace
		const normalisedOriginal = normaliseHtmlContent(state.originalContent);
		const normalisedCurrent = normaliseHtmlContent(state.currentContent);

		return normalisedOriginal !== normalisedCurrent;
	};

	/**
	 * Save a specific editor's changes
	 * @throws Error if save fails
	 */
	saveEditor = async (
		contentType: ContentType,
		entityId: number
	): Promise<void> => {
		const identifier = `${contentType}:${entityId}`;
		const state = this.editorStates.get(identifier);

		if (!state) {
			throw new Error(`Editor ${identifier} not found`);
		}

		// Get config for this content type
		const config = CONTENT_TYPE_CONFIGS[contentType];
		if (!config) {
			throw new Error(
				`No configuration found for content type: ${contentType}`
			);
		}

		try {
			// Call the update function from config
			await config.updateFn(entityId, state.currentContent);

			// Update original content to match current (no longer has changes)
			state.originalContent = state.currentContent;

			// Unregister the editor since it's saved
			this.unregisterEditor(contentType, entityId);
		} catch (error) {
			// Re-throw with more context
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new Error(`Failed to save ${contentType}: ${message}`, {
				cause: error,
			});
		}
	};

	/**
	 * Discard a specific editor's changes
	 */
	discardEditor = (contentType: ContentType, entityId: number): void => {
		const identifier = `${contentType}:${entityId}`;
		const state = this.editorStates.get(identifier);

		if (!state) {
			console.warn(`Editor ${identifier} not found for discard`);
			return;
		}

		// Simply unregister the editor (changes are discarded)
		this.unregisterEditor(contentType, entityId);
	};

	/**
	 * Save all editors with unsaved changes
	 * @returns Object with success count and any errors
	 */
	saveAll = async (): Promise<{ successCount: number; errors: Error[] }> => {
		const editors = this.editorsWithChanges;
		const errors: Error[] = [];
		let successCount = 0;

		// Save each editor sequentially
		for (const editor of editors) {
			try {
				await this.saveEditor(editor.contentType, editor.entityId);
				successCount++;
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
		}

		return { successCount, errors };
	};

	/**
	 * Discard all editors with unsaved changes
	 */
	discardAll = (): void => {
		const editors = this.editorsWithChanges;

		// Discard each editor
		for (const editor of editors) {
			this.discardEditor(editor.contentType, editor.entityId);
		}
	};

	/**
	 * Scroll to a specific editor in the viewport
	 */
	scrollToEditor = (identifier: string): void => {
		const state = this.editorStates.get(identifier);

		if (!state?.elementRef) {
			console.warn(
				`Cannot scroll to editor ${identifier}: element ref not found`
			);
			return;
		}

		const element = state.elementRef;

		// Check if element is already visible
		const rect = element.getBoundingClientRect();
		const isVisible =
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <=
				(window.innerHeight || document.documentElement.clientHeight) &&
			rect.right <= (window.innerWidth || document.documentElement.clientWidth);

		if (isVisible) {
			// Already visible, just highlight
			this.highlightEditor(identifier);
			return;
		}

		// Check prefers-reduced-motion
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;

		// Scroll to element
		element.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "center",
			inline: "nearest",
		});

		// Highlight after scrolling
		this.highlightEditor(identifier);
	};

	/**
	 * Highlight an editor with a visual pulse animation
	 */
	highlightEditor = (identifier: string): void => {
		const state = this.editorStates.get(identifier);

		if (!state?.elementRef) {
			console.warn(
				`Cannot highlight editor ${identifier}: element ref not found`
			);
			return;
		}

		const element = state.elementRef;

		// Remove class first to force animation restart if already playing
		element.classList.remove("editor-highlight");
		// Force reflow so the browser registers the removal before re-adding
		void element.offsetWidth;
		element.classList.add("editor-highlight");

		// Remove class after animation completes
		setTimeout(() => {
			element.classList.remove("editor-highlight");
		}, 3500);
	};
}

export const inlineEditStore = new InlineEditStore();
