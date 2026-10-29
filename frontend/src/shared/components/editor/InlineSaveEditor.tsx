import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Copy, Check } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import { RichTextDisplay } from "./RichTextDisplay";
import { WordCounter } from "./WordCounter";
import { ClickToEditBadge } from "@/shared/components/ClickToEditBadge";
import { inlineEditStore } from "@/app/stores/InlineEditStore";
import { useUpdateContent } from "@/shared/hooks/queries/useUpdateContent";
import { CONTENT_TYPE_CONFIGS } from "@/shared/config/content-types.config";
import { countWords } from "@/shared/utils/word-count.utils";
import {
	hasRichTextChanged,
	isRichTextEmpty,
} from "@/shared/utils/rich-text.utils";
import type { ContentType } from "@/shared/types/inline-edit.types";
import type { ToolbarMode } from "@/shared/types/editor.types";
import { sanitizeRichText } from "@/shared/utils/sanitise.utils";

export interface InlineSaveEditorProps {
	// Content configuration
	contentType: ContentType;
	entityId: number;
	initialContent: string;

	// Permissions
	canEdit?: boolean;

	// Locked state — shown as tooltip when hovering on a non-editable field
	lockedMessage?: string;

	// Display configuration
	label?: React.ReactNode;
	placeholder?: string;
	emptyMessage?: string;
	wordLimit?: number;
	limitCanBePassed?: boolean; // If true, shows "Aim for max of X words", if false shows "Limit: X words"
	showWordLimitInLabel?: boolean; // Show word limit in label header

	// Editor configuration
	toolbar?: ToolbarMode;

	// Lifecycle callbacks
	onEditStart?: () => void;
	onEditEnd?: () => void;
	onSaveSuccess?: () => void;
	onSaveError?: (error: Error) => void;
	onCancel?: () => void;

	// Styling
	className?: string;

	// Compact mode — smaller label, no background/border on header (for report cards)
	compact?: boolean;
}

/**
 * InlineSaveEditor component
 *
 * Unified inline editing component with save functionality.
 * Supports view mode and edit mode with automatic state management.
 */
export const InlineSaveEditor = observer(function InlineSaveEditor({
	contentType,
	entityId,
	initialContent,
	canEdit = false,
	lockedMessage,
	label,
	placeholder,
	emptyMessage,
	wordLimit,
	limitCanBePassed = false,
	showWordLimitInLabel = false,
	toolbar: toolbarProp = "full",
	onEditStart,
	onEditEnd,
	onSaveSuccess,
	onSaveError,
	onCancel,
	className = "",
	compact = false,
}: InlineSaveEditorProps) {
	const config = CONTENT_TYPE_CONFIGS[contentType];

	const isEditing = inlineEditStore.isEditing(contentType, entityId);

	// Local state for edited content
	const [editedContent, setEditedContent] = useState(initialContent);
	const [hasChanges, setHasChanges] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [hasCopied, setHasCopied] = useState(false);

	// Refs for focus management and navigation blocking
	const editButtonRef = useRef<HTMLDivElement>(null);
	const editorContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Local state for saved content (optimistic update)
	const [savedContent, setSavedContent] = useState(initialContent);

	// The editor's own HTML for the saved content in the current edit session.
	// Edits are compared against this rather than the stored HTML, which older
	// editors or Word paste may have serialised differently.
	const baselineRef = useRef<string | null>(null);
	const handleBaselineChange = useCallback((html: string) => {
		baselineRef.current = html;
	}, []);

	// Check if over word limit
	const wordCount = useMemo(() => {
		if (!wordLimit) return 0;
		return countWords(editedContent);
	}, [editedContent, wordLimit]);

	const isOverLimit = wordLimit !== undefined && wordCount > wordLimit;
	// A suggested limit ("Aim for max of X words") guides the author but must not
	// stop them saving; only a hard limit blocks saving
	const isOverHardLimit = isOverLimit && !limitCanBePassed;

	// Update mutation
	const updateMutation = useUpdateContent({
		contentType,
		entityId,
		onSuccess: () => {
			// Optimistically update the saved content immediately
			setSavedContent(editedContent);

			inlineEditStore.endEdit(contentType, entityId);

			// Unregister editor from enhanced store
			inlineEditStore.unregisterEditor(contentType, entityId);

			setHasChanges(false);
			setStatusMessage("Content saved successfully");
			onSaveSuccess?.();
			onEditEnd?.();

			// Return focus to edit button
			setTimeout(() => {
				editButtonRef.current?.focus();
			}, 0);
		},
		onError: (error) => {
			onSaveError?.(error);
			// Keep editor in edit mode on error
		},
	});

	// Handle entering edit mode
	const handleEditClick = () => {
		inlineEditStore.startEdit(contentType, entityId);
		setStatusMessage("Edit mode activated");

		// A new editor instance loads the content and reports a fresh baseline
		baselineRef.current = null;

		// Note: Editor registration is handled by useEffect
		// This ensures it works both on initial click and after tab switches

		setEditedContent(savedContent);
		setHasChanges(false);
		setIsFocused(true); // Set focused when entering edit mode
		onEditStart?.();
	};

	// Handle save (Save button and Ctrl+S share the same rules)
	const handleSave = () => {
		if (!hasChanges || isOverHardLimit || updateMutation.isPending) return;
		setStatusMessage("Saving content...");
		updateMutation.mutate(editedContent);
	};

	// Handle cancel
	const handleCancel = useCallback(() => {
		inlineEditStore.endEdit(contentType, entityId);

		// Unregister editor from enhanced store
		inlineEditStore.unregisterEditor(contentType, entityId);

		setEditedContent(savedContent);
		setHasChanges(false);
		setIsFocused(false); // Clear focus when canceling
		setStatusMessage("Editing cancelled");
		onCancel?.();
		onEditEnd?.();

		// Return focus to edit button
		setTimeout(() => {
			editButtonRef.current?.focus();
		}, 0);
	}, [contentType, entityId, savedContent, onCancel, onEditEnd]);

	// Fallback comparison for when the editor has not reported a baseline.
	// Strips all attributes (class, style, data-*, etc.) since Lexical adds its own
	// during serialisation, but preserves structural tags so p→ul/li changes are
	// detected. Attribute-only edits (alignment, indentation) and line breaks are
	// invisible to it, which is why the baseline comparison is preferred.
	const normaliseForComparison = (html: string) => {
		const sanitised = sanitizeRichText(html);
		return sanitised
			.replace(/<([a-z][a-z0-9]*)\s+[^>]*?>/gi, "<$1>") // Strip all attributes from opening tags
			.replace(/<br\s*\/?>/gi, "") // Remove <br> tags (Lexical adds these in empty paragraphs)
			.replace(/<span>(.*?)<\/span>/gi, "$1") // Unwrap plain spans (Lexical wraps text in spans)
			.replace(/<p><\/p>/g, "") // Remove empty paragraphs
			.replace(/<div><\/div>/g, "") // Remove empty divs
			.replace(/\s+/g, " ")
			.trim();
	};

	// Handle copying content to clipboard (for locked editors)
	const handleCopyContent = useCallback(() => {
		// Strip HTML tags to get plain text
		const tempDiv = document.createElement("div");
		tempDiv.innerHTML = savedContent;
		const plainText = tempDiv.textContent || tempDiv.innerText || "";

		navigator.clipboard.writeText(plainText).then(() => {
			setHasCopied(true);
			setStatusMessage("Content copied to clipboard");
			setTimeout(() => setHasCopied(false), 2000);
		});
	}, [savedContent]);

	const handleContentChange = (newContent: string) => {
		setEditedContent(newContent);
		const baseline = baselineRef.current;
		setHasChanges(
			baseline !== null
				? hasRichTextChanged(baseline, newContent)
				: normaliseForComparison(newContent) !==
						normaliseForComparison(savedContent)
		);

		// Update current content in store (updates immediately for change detection)
		inlineEditStore.updateCurrentContent(contentType, entityId, newContent);
	};

	// Update saved content when initialContent changes (from query refetch)
	// Only update if the content actually changed to avoid unnecessary re-renders
	useEffect(() => {
		setSavedContent((prev) =>
			prev === initialContent ? prev : initialContent
		);
	}, [initialContent]);

	// Update edited content when entering edit mode
	useEffect(() => {
		if (!isEditing) {
			setEditedContent(savedContent);
			setHasChanges(false);
			setIsFocused(false); // Clear focus when exiting edit mode
		}
	}, [isEditing, savedContent]);

	// Register/unregister editor based on isEditing state
	// This handles both initial registration and re-registration after tab switches
	useEffect(() => {
		if (isEditing) {
			// Register editor when in edit mode
			// IMPORTANT: Only register with savedContent (server state), not editedContent
			// This ensures originalContent stays stable even when user makes changes
			inlineEditStore.registerEditor({
				contentType,
				entityId,
				originalContent: savedContent,
				elementRef: containerRef.current,
			});
		}

		// Cleanup: unregister on unmount or when exiting edit mode
		return () => {
			if (isEditing) {
				inlineEditStore.unregisterEditor(contentType, entityId);
			}
		};
	}, [isEditing, contentType, entityId, savedContent]);

	// Separate effect to update current content when editedContent changes
	// This runs independently of registration to avoid re-registering on every keystroke
	useEffect(() => {
		if (isEditing) {
			inlineEditStore.updateCurrentContent(
				contentType,
				entityId,
				editedContent
			);
		}
	}, [editedContent, isEditing, contentType, entityId]);

	// Share the Save button's change state with the store so the unsaved-changes
	// warning on navigation follows the same rule. The store's own comparison
	// drops blank lines and treats older stored HTML as always changed.
	useEffect(() => {
		if (isEditing) {
			inlineEditStore.reportHasChanges(contentType, entityId, hasChanges);
		}
	}, [hasChanges, isEditing, contentType, entityId]);

	// Track focus/blur events on the editor container
	useEffect(() => {
		const container = editorContainerRef.current;
		if (!container || !isEditing) return;

		const handleFocusIn = () => setIsFocused(true);
		const handleFocusOut = (e: FocusEvent) => {
			// Only blur if focus is leaving the container entirely
			if (!container.contains(e.relatedTarget as Node)) {
				setIsFocused(false);
			}
		};

		container.addEventListener("focusin", handleFocusIn);
		container.addEventListener("focusout", handleFocusOut);

		return () => {
			container.removeEventListener("focusin", handleFocusIn);
			container.removeEventListener("focusout", handleFocusOut);
		};
	}, [isEditing]);

	// Focus editor when entering edit mode
	useEffect(() => {
		if (isEditing && editorRef.current) {
			setTimeout(() => {
				editorRef.current?.focus();
			}, 100);
		}
	}, [isEditing]);

	// Escape key handler for edit mode
	useEffect(() => {
		if (!isEditing) return;

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				handleCancel();
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [isEditing, handleCancel]);

	// Determine placeholder and empty message
	const effectivePlaceholder = placeholder || config?.defaultPlaceholder || "";
	const effectiveEmptyMessage =
		emptyMessage || config?.defaultEmptyMessage || "";

	// Generate unique IDs for ARIA
	const errorId = `error-${contentType}-${entityId}`;

	// Render label with optional word limit
	const renderLabel = () => {
		if (!label) return null;

		if (typeof label !== "string") {
			return label;
		}

		return (
			<div className="flex items-center gap-2">
				<span
					className={compact ? "text-lg font-bold" : "text-xl font-semibold"}
				>
					{label}
				</span>
				{showWordLimitInLabel && wordLimit && (
					<span className="text-xs text-muted-foreground">
						(max {wordLimit} words)
					</span>
				)}
			</div>
		);
	};

	// Safety check: Ensure config exists for this contentType
	if (!config) {
		console.error(`No config found for contentType: ${contentType}`);
		return (
			<div className="rounded-md border border-destructive bg-destructive/10 p-4">
				<p className="text-sm text-destructive">
					Error: Invalid content type &quot;{contentType}&quot;. Please contact
					support.
				</p>
			</div>
		);
	}

	return (
		<div className={`space-y-6 ${className}`}>
			{/* Screen reader status announcements */}
			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				className="sr-only"
			>
				{statusMessage}
			</div>

			{!isEditing ? (
				// View mode - Clickable container with hover effect
				<div
					ref={editButtonRef}
					className={`rounded-lg overflow-hidden ${
						compact
							? `border border-transparent bg-transparent transition-all ${canEdit ? "cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm hover:bg-white dark:hover:bg-gray-900/50" : lockedMessage ? "cursor-not-allowed" : ""}`
							: `bg-white dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 shadow-sm ${canEdit ? "cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-600" : lockedMessage ? "cursor-not-allowed" : ""}`
					}`}
					title={!canEdit && lockedMessage ? lockedMessage : undefined}
					onClick={canEdit ? handleEditClick : undefined}
					onMouseEnter={() => canEdit && setIsHovered(true)}
					onMouseLeave={() => canEdit && setIsHovered(false)}
					onKeyDown={(e) => {
						if (canEdit && (e.key === "Enter" || e.key === " ")) {
							e.preventDefault();
							handleEditClick();
						}
					}}
					tabIndex={canEdit ? 0 : undefined}
					role={canEdit ? "button" : undefined}
					aria-label={
						canEdit
							? `Edit ${typeof label === "string" ? label : "content"}`
							: undefined
					}
				>
					{/* Header section with label and click-to-edit badge */}
					{label && (
						<div
							className={`flex items-center justify-between ${
								compact
									? "px-6 pt-4 pb-1"
									: "px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
							}`}
						>
							<div>{renderLabel()}</div>
							{canEdit && <ClickToEditBadge isVisible={isHovered} />}
							{!canEdit && lockedMessage && !isRichTextEmpty(savedContent) && (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="size-7 text-muted-foreground hover:text-foreground"
											onClick={(e) => {
												e.stopPropagation();
												handleCopyContent();
											}}
											aria-label="Copy content"
										>
											{hasCopied ? (
												<Check className="size-3.5 text-green-600" />
											) : (
												<Copy className="size-3.5" />
											)}
										</Button>
									</TooltipTrigger>
									<TooltipContent>
										{hasCopied ? "Copied" : "Copy content"}
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					)}

					{/* Content section with more padding */}
					<div
						className={`px-6 py-5 min-w-0 ${canEdit ? "cursor-pointer" : ""}`}
					>
						<RichTextDisplay
							content={savedContent}
							emptyMessage={effectiveEmptyMessage}
							className="min-h-[60px] cursor-inherit"
						/>
					</div>

					{/* Click-to-edit badge at bottom if no label */}
					{!label && canEdit && (
						<div className="px-6 pb-4 flex justify-end">
							<ClickToEditBadge isVisible={isHovered} />
						</div>
					)}
				</div>
			) : (
				// Edit mode - Keep header visible with Cancel button
				<div
					ref={containerRef}
					className={`relative rounded-lg shadow-sm overflow-hidden transition-all duration-300 ${
						isFocused
							? "border-2 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-950/20"
							: hasChanges
								? "border-2 border-amber-500 dark:border-amber-400 bg-amber-50/50 dark:bg-amber-950/20"
								: "border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900"
					}`}
				>
					{/* Header section with label — matches toolbar bg for visual continuity */}
					{label && (
						<div
							className={`flex items-center justify-between ${
								compact
									? "px-6 pt-4 pb-1"
									: "px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50 dark:bg-gray-800"
							}`}
						>
							<div>{renderLabel()}</div>
						</div>
					)}

					{/* Editor content — bg is transparent via inline-save-editor CSS class */}
					<div ref={editorContainerRef}>
						<RichTextEditor
							ref={editorRef}
							value={editedContent}
							onChange={handleContentChange}
							onBaselineChange={handleBaselineChange}
							onSave={handleSave}
							placeholder={effectivePlaceholder}
							toolbar={toolbarProp}
							wordLimit={wordLimit}
							limitCanBePassed={limitCanBePassed}
							className="inline-save-editor"
							autoFocus={true}
							moveCursorToEnd={true}
							aria-label={`Edit ${typeof label === "string" ? label : "content"}`}
							aria-invalid={isOverHardLimit}
							aria-describedby={isOverLimit ? errorId : undefined}
						/>

						{/* Error message for a hard word limit */}
						{isOverHardLimit && (
							<div
								id={errorId}
								role="alert"
								aria-live="assertive"
								className="px-4 pt-2 text-sm text-destructive"
							>
								Content exceeds word limit of {wordLimit} words
							</div>
						)}

						{/* Advisory message for a suggested word limit — saving is still allowed */}
						{isOverLimit && !isOverHardLimit && (
							<div
								id={errorId}
								aria-live="polite"
								className="px-4 pt-2 text-sm text-amber-700 dark:text-amber-400"
							>
								Content is over the suggested limit of {wordLimit} words
							</div>
						)}

						<div className="flex items-center justify-between p-4">
							<div className="flex items-center gap-2">
								<WordCounter
									content={editedContent}
									limit={wordLimit}
									showLimit={!!wordLimit}
									limitCanBePassed={limitCanBePassed}
								/>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										setEditedContent("");
										setHasChanges(true);
									}}
									aria-label="Clear content"
								>
									Clear
								</Button>
							</div>

							<div className="flex items-center gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCancel}
									aria-label="Cancel"
								>
									Cancel
								</Button>
								<Button
									type="button"
									onClick={handleSave}
									disabled={
										!hasChanges || isOverHardLimit || updateMutation.isPending
									}
									size="sm"
									aria-label={`Save ${typeof label === "string" ? label : "content"}`}
								>
									{updateMutation.isPending ? "Saving..." : "Save"}
								</Button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
});
