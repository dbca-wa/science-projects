import { makeObservable, action, observable } from "mobx";
import { logger } from "@/shared/services/logger.service";
import { BaseStore, type BaseStoreState } from "../base.store";
import type { LexicalEditor } from "lexical";
import {
	$getSelection,
	$isRangeSelection,
	$getRoot,
	$createParagraphNode,
	CAN_UNDO_COMMAND,
	CAN_REDO_COMMAND,
	FORMAT_TEXT_COMMAND,
	UNDO_COMMAND,
	REDO_COMMAND,
	COMMAND_PRIORITY_LOW,
	INDENT_CONTENT_COMMAND,
	OUTDENT_CONTENT_COMMAND,
	FORMAT_ELEMENT_COMMAND,
	type ElementFormatType,
} from "lexical";
import {
	$isListNode,
	$isListItemNode,
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND,
	INSERT_CHECK_LIST_COMMAND,
} from "@lexical/list";
import {
	$isHeadingNode,
	$createHeadingNode,
	type HeadingTagType,
} from "@lexical/rich-text";
import { $isLinkNode } from "@lexical/link";
import { $setBlocksType } from "@lexical/selection";
import { INSERT_TABLE_COMMAND } from "@lexical/table";

interface EditorStoreState extends BaseStoreState {
	// InlineSaveEditor state
	openEditorsCount: number;
	isDialogOpen: boolean;
	pendingAction: (() => void) | null;

	// Lexical editor toolbar state
	isBold: boolean;
	isItalic: boolean;
	isUnderline: boolean;
	isStrikethrough: boolean;
	isSubscript: boolean;
	isSuperscript: boolean;
	canUndo: boolean;
	canRedo: boolean;
	blockType: "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	isNumberedList: boolean;
	isBulletList: boolean;
	isList: boolean;
	listType: "bullet" | "number" | "check" | null;
	isLink: boolean;
	indentLevel: number;
	maxIndent: number;
	textAlignment: "left" | "center" | "right" | "justify";
}

export type TextFormatType =
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "subscript"
	| "superscript";

export type BlockType = EditorStoreState["blockType"];
export type TextAlignment = "left" | "center" | "right" | "justify";

export class EditorStore extends BaseStore<EditorStoreState> {
	private lexicalEditor: LexicalEditor | null = null;
	private unregisterListeners: (() => void)[] = [];
	/** Unique key identifying the currently active editor instance */
	activeEditorKey: string | null = null;

	constructor() {
		super({
			openEditorsCount: 0,
			isDialogOpen: false,
			pendingAction: null,
			loading: false,
			error: null,
			initialised: false,
			// Lexical toolbar state
			isBold: false,
			isItalic: false,
			isUnderline: false,
			isStrikethrough: false,
			isSubscript: false,
			isSuperscript: false,
			canUndo: false,
			canRedo: false,
			blockType: "paragraph",
			isNumberedList: false,
			isBulletList: false,
			isList: false,
			listType: null,
			isLink: false,
			indentLevel: 0,
			maxIndent: 7,
			textAlignment: "left",
		});

		makeObservable(this, {
			// Active editor tracking
			activeEditorKey: observable,
			// InlineSaveEditor actions
			openEditor: action,
			closeEditor: action,
			setDialogOpen: action,
			setPendingAction: action,
			manuallyCheckAndToggleDialog: action,
			handleProceed: action,
			handleReset: action,
			shouldBlockNavigation: action,
			// Lexical toolbar actions
			initLexicalEditor: action,
			releaseLexicalEditor: action,
			updateFormattingState: action,
			clearFormattingState: action,
			toggleFormat: action,
			undo: action,
			redo: action,
			setBlockType: action,
			toggleList: action,
			increaseIndent: action,
			decreaseIndent: action,
			setTextAlignment: action,
			insertTable: action,
			clearEditor: action,
			reset: action,
		});
	}

	/**
	 * Initialises the editor store.
	 */
	public async initialise(): Promise<void> {
		await this.executeAsync(
			async () => {
				this.state.initialised = true;
				logger.info("Editor store initialised");
			},
			"initialise_editor",
			{ silent: true }
		);
	}

	/**
	 * Increments the count of open editors.
	 */
	openEditor = () => {
		this.state.openEditorsCount = Math.max(this.state.openEditorsCount + 1, 0);

		logger.info("Editor opened", {
			count: this.state.openEditorsCount,
		});
	};

	/**
	 * Decrements the count of open editors and auto-closes dialog if count reaches zero.
	 */
	closeEditor = () => {
		this.state.openEditorsCount = Math.max(this.state.openEditorsCount - 1, 0);

		if (this.state.openEditorsCount === 0 && this.state.isDialogOpen) {
			this.state.isDialogOpen = false;
		}

		logger.info("Editor closed", {
			count: this.state.openEditorsCount,
		});
	};

	/**
	 * Sets the dialog open state.
	 */
	setDialogOpen = (open: boolean) => {
		this.state.isDialogOpen = open;
		logger.info("Editor dialog state changed", { open });
	};

	/**
	 * Sets a pending action to execute after dialog is confirmed.
	 */
	setPendingAction = (action: (() => void) | null) => {
		this.state.pendingAction = action;
	};

	/**
	 * Checks if editors are open and shows dialog if needed, otherwise executes action immediately.
	 */
	manuallyCheckAndToggleDialog = (action: () => void) => {
		if (this.state.openEditorsCount > 0) {
			this.setPendingAction(() => action);
			this.setDialogOpen(true);
		} else {
			action();
		}
	};

	/**
	 * Proceeds with closing all editors and executes pending action.
	 */
	handleProceed = (blockerProceed?: () => void) => {
		this.setDialogOpen(false);
		this.state.openEditorsCount = 0;

		if (blockerProceed) {
			blockerProceed();
		}

		if (this.state.pendingAction) {
			this.state.pendingAction();
			this.setPendingAction(null);
		}

		logger.info("Editor dialog proceeded");
	};

	/**
	 * Resets dialog state without executing pending action.
	 */
	handleReset = (blockerReset?: () => void) => {
		this.setDialogOpen(false);
		this.setPendingAction(null);

		if (blockerReset) {
			blockerReset();
		}

		logger.info("Editor dialog reset");
	};

	/**
	 * Determines if navigation should be blocked based on open editors.
	 */
	shouldBlockNavigation = (currentPath: string, nextPath: string): boolean => {
		const shouldBlock =
			this.state.openEditorsCount > 0 && currentPath !== nextPath;

		if (shouldBlock) {
			this.setDialogOpen(true);
		}

		return shouldBlock;
	};

	/**
	 * @returns The number of currently open editors
	 */
	get openEditorsCount() {
		return this.state.openEditorsCount;
	}

	/**
	 * @returns True if the unsaved changes dialog is open
	 */
	get isDialogOpen() {
		return this.state.isDialogOpen;
	}

	/**
	 * @returns The pending action to execute after dialog confirmation
	 */
	get pendingAction() {
		return this.state.pendingAction;
	}

	/**
	 * Performs cleanup when store is disposed.
	 */
	async dispose() {
		this.unregisterListeners.forEach((unregister) => unregister());
		this.unregisterListeners = [];
		this.lexicalEditor = null;
		logger.info("Editor store disposed");
	}

	/**
	 * Initialise or switch to a Lexical editor instance.
	 * When multiple editors exist on a page, this is called on focus
	 * to make the focused editor the active one for toolbar commands.
	 * Listeners are only registered once per editor instance.
	 */
	initLexicalEditor = (editor: LexicalEditor, editorKey?: string) => {
		// Same editor — just refresh formatting state, don't re-register listeners
		if (this.lexicalEditor === editor) {
			this.activeEditorKey = editorKey ?? this.activeEditorKey;
			this.updateFormattingState();
			return;
		}

		// Different editor — clean up old listeners before switching
		if (this.lexicalEditor) {
			for (const unregister of this.unregisterListeners) {
				unregister();
			}
			this.unregisterListeners = [];
		}

		this.lexicalEditor = editor;
		this.activeEditorKey = editorKey ?? null;

		// Register update listener to track ALL editor state changes
		const removeUpdateListener = editor.registerUpdateListener(
			({ editorState: _editorState }) => {
				this.updateFormattingState();
			}
		);

		// Register command listeners for undo/redo
		this.registerCommandListeners();

		// Store cleanup function for update listener
		this.unregisterListeners.push(removeUpdateListener);

		// Initial formatting state update
		this.updateFormattingState();
	};

	/**
	 * Release an editor instance when it unmounts.
	 *
	 * Without this the store keeps pointing at a destroyed editor, so toolbar
	 * commands from the next editor that opens are silently sent to the old one.
	 * Releasing also lets the next editor to mount become active straight away.
	 * Does nothing if a different editor is currently active.
	 */
	releaseLexicalEditor = (editor: LexicalEditor) => {
		if (this.lexicalEditor !== editor) return;

		for (const unregister of this.unregisterListeners) {
			unregister();
		}
		this.unregisterListeners = [];
		this.lexicalEditor = null;
		this.activeEditorKey = null;
		this.state.canUndo = false;
		this.state.canRedo = false;
		this.clearFormattingState();
	};

	/**
	 * Register Lexical command listeners
	 */
	private registerCommandListeners() {
		if (!this.lexicalEditor) return;

		// Listen for undo/redo state changes
		const removeUndoListener = this.lexicalEditor.registerCommand(
			CAN_UNDO_COMMAND,
			(payload: boolean) => {
				this.state.canUndo = payload;
				return false;
			},
			COMMAND_PRIORITY_LOW
		);

		const removeRedoListener = this.lexicalEditor.registerCommand(
			CAN_REDO_COMMAND,
			(payload: boolean) => {
				this.state.canRedo = payload;
				return false;
			},
			COMMAND_PRIORITY_LOW
		);

		// Store cleanup functions
		this.unregisterListeners.push(removeUndoListener, removeRedoListener);
	}

	/**
	 * Update formatting state based on current selection
	 */
	updateFormattingState = () => {
		if (!this.lexicalEditor) return;

		this.lexicalEditor.getEditorState().read(() => {
			const selection = $getSelection();

			if ($isRangeSelection(selection)) {
				// Update text formatting
				this.state.isBold = selection.hasFormat("bold");
				this.state.isItalic = selection.hasFormat("italic");
				this.state.isUnderline = selection.hasFormat("underline");
				this.state.isStrikethrough = selection.hasFormat("strikethrough");
				this.state.isSubscript = selection.hasFormat("subscript");
				this.state.isSuperscript = selection.hasFormat("superscript");

				// Update block type
				const anchorNode = selection.anchor.getNode();
				const element =
					anchorNode.getKey() === "root"
						? anchorNode
						: anchorNode.getTopLevelElementOrThrow();

				if ($isHeadingNode(element)) {
					this.state.blockType = element.getTag();
					this.state.isNumberedList = false;
					this.state.isBulletList = false;
					this.state.isList = false;
					this.state.listType = null;
				} else {
					// Check for lists by traversing up from anchor node
					let isList = false;
					let listType: "bullet" | "number" | "check" | null = null;
					let currentNode = anchorNode;

					// Traverse up the tree to find list item
					while (currentNode) {
						if ($isListItemNode(currentNode)) {
							isList = true;
							const listParent = currentNode.getParent();
							if ($isListNode(listParent)) {
								const lexicalListType = listParent.getListType();
								listType =
									lexicalListType === "number"
										? "number"
										: lexicalListType === "check"
											? "check"
											: "bullet";
							}
							break;
						}
						const parent = currentNode.getParent();
						if (!parent) break;
						currentNode = parent;
					}

					this.state.blockType = "paragraph";
					this.state.isList = isList;
					this.state.listType = listType;
					this.state.isNumberedList = listType === "number";
					this.state.isBulletList = listType === "bullet";
				}

				// Update link state
				const node = selection.anchor.getNode();
				const parent = node.getParent();
				this.state.isLink = $isLinkNode(parent) || $isLinkNode(node);
			}
		});
	};

	/**
	 * Clear all formatting state — used when no editor is focused
	 * to prevent stale toolbar highlights
	 */
	clearFormattingState = () => {
		this.state.isBold = false;
		this.state.isItalic = false;
		this.state.isUnderline = false;
		this.state.isStrikethrough = false;
		this.state.isSubscript = false;
		this.state.isSuperscript = false;
		this.state.isLink = false;
		this.state.blockType = "paragraph";
		this.state.isList = false;
		this.state.listType = null;
		this.state.isNumberedList = false;
		this.state.isBulletList = false;
	};

	/**
	 * Toggle text formatting (bold, italic, etc.)
	 */
	toggleFormat = (format: TextFormatType) => {
		if (!this.lexicalEditor) return;
		this.lexicalEditor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
	};

	/**
	 * Undo last action
	 */
	undo = () => {
		if (!this.lexicalEditor) return;
		this.lexicalEditor.dispatchCommand(UNDO_COMMAND, undefined);
	};

	/**
	 * Redo last undone action
	 */
	redo = () => {
		if (!this.lexicalEditor) return;
		this.lexicalEditor.dispatchCommand(REDO_COMMAND, undefined);
	};

	/**
	 * Set block type (heading, paragraph)
	 */
	setBlockType = (blockType: BlockType) => {
		if (!this.lexicalEditor) return;

		this.lexicalEditor.update(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				if (blockType === "paragraph") {
					$setBlocksType(selection, () => $createParagraphNode());
				} else {
					$setBlocksType(selection, () =>
						$createHeadingNode(blockType as HeadingTagType)
					);
				}
			}
		});
	};

	/**
	 * Cycle through list types: none → bullet → numbered → checklist → none
	 */
	toggleList = () => {
		if (!this.lexicalEditor) return;

		if (!this.state.isList) {
			// Not in a list, create bullet list
			this.lexicalEditor.dispatchCommand(
				INSERT_UNORDERED_LIST_COMMAND,
				undefined
			);
		} else if (this.state.listType === "bullet") {
			// In bullet list, switch to numbered list
			this.lexicalEditor.dispatchCommand(
				INSERT_ORDERED_LIST_COMMAND,
				undefined
			);
		} else if (this.state.listType === "number") {
			// In numbered list, switch to checklist
			this.lexicalEditor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
		} else {
			// In checklist (or other), remove list (back to paragraph)
			this.lexicalEditor.update(() => {
				const selection = $getSelection();
				if ($isRangeSelection(selection)) {
					$setBlocksType(selection, () => $createParagraphNode());
				}
			});
		}
	};

	/**
	 * Increase indent level
	 */
	increaseIndent = () => {
		if (!this.lexicalEditor) return;
		if (this.state.indentLevel >= this.state.maxIndent) return;

		this.lexicalEditor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
		this.state.indentLevel = Math.min(
			this.state.indentLevel + 1,
			this.state.maxIndent
		);
	};

	/**
	 * Decrease indent level
	 */
	decreaseIndent = () => {
		if (!this.lexicalEditor) return;
		if (this.state.indentLevel <= 0) return;

		this.lexicalEditor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
		this.state.indentLevel = Math.max(this.state.indentLevel - 1, 0);
	};

	/**
	 * Set text alignment
	 */
	setTextAlignment = (alignment: TextAlignment) => {
		if (!this.lexicalEditor) return;

		// Map our alignment type to Lexical's ElementFormatType
		const formatMap: Record<TextAlignment, ElementFormatType> = {
			left: "left",
			center: "center",
			right: "right",
			justify: "justify",
		};

		this.lexicalEditor.dispatchCommand(
			FORMAT_ELEMENT_COMMAND,
			formatMap[alignment]
		);
		this.state.textAlignment = alignment;
	};

	/**
	 * Insert table
	 */
	insertTable = (rows: number, columns: number) => {
		if (!this.lexicalEditor) return;

		this.lexicalEditor.dispatchCommand(INSERT_TABLE_COMMAND, {
			rows: String(rows),
			columns: String(columns),
		});
	};

	/**
	 * Clear all editor content
	 */
	clearEditor = () => {
		if (!this.lexicalEditor) return;

		this.lexicalEditor.update(() => {
			const root = $getRoot();
			root.clear();
			// Add a single empty paragraph
			root.append($createParagraphNode());
		});
	};

	/**
	 * Resets store to initial state.
	 */
	reset() {
		this.state.openEditorsCount = 0;
		this.state.isDialogOpen = false;
		this.state.pendingAction = null;
		this.state.loading = false;
		this.state.error = null;
		this.state.initialised = false;
		// Reset toolbar state
		this.state.isBold = false;
		this.state.isItalic = false;
		this.state.isUnderline = false;
		this.state.isStrikethrough = false;
		this.state.isSubscript = false;
		this.state.isSuperscript = false;
		this.state.canUndo = false;
		this.state.canRedo = false;
		this.state.blockType = "paragraph";
		this.state.isNumberedList = false;
		this.state.isBulletList = false;
		this.state.isList = false;
		this.state.listType = null;
		this.state.isLink = false;
		this.state.indentLevel = 0;
		this.state.textAlignment = "left";

		logger.info("Editor store reset complete");
	}
}
