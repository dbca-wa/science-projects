/**
 * FloatingLinkToolbar Plugin
 *
 * A compact absolute-positioned toolbar that appears near the user's text selection,
 * providing formatting, structure, and link controls based on the active toolbar mode.
 * Positioned relative to the .editor-container to avoid z-index conflicts with
 * Dialog/Drawer wrappers.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	SELECTION_CHANGE_COMMAND,
	FORMAT_TEXT_COMMAND,
} from "lexical";
import { $isLinkNode } from "@lexical/link";
import { $isListNode, $isListItemNode } from "@lexical/list";
import {
	Link as LinkIcon,
	Bold,
	Italic,
	Underline,
	Strikethrough,
	Subscript,
	Superscript,
	RemoveFormatting,
	List,
	ListOrdered,
	ListChecks,
	Indent,
	Outdent,
	AlignLeft,
	AlignCenter,
	AlignRight,
	AlignJustify,
} from "lucide-react";
import { useLinkEditor } from "../toolbar/link-editor.utils";
import { useEditorStore } from "@/app/stores/store-context";
import { TOOLBAR_CONFIGS } from "../toolbar/toolbar-configs";
import type { ToolbarMode } from "@/shared/types/editor.types";

interface FloatingLinkToolbarProps {
	showLinks: boolean;
	toolbar?: ToolbarMode;
	/** Key of the editor this toolbar belongs to, shared with the main toolbar */
	editorKey?: string;
}

const TOOLBAR_HEIGHT = 36;
const TOOLBAR_GAP = 10;

export const FloatingLinkToolbar = ({
	showLinks,
	toolbar = "full",
	editorKey,
}: FloatingLinkToolbarProps) => {
	const [editor] = useLexicalComposerContext();
	const linkEditor = useLinkEditor();
	const editorStore = useEditorStore();
	const [position, setPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [isOnLink, setIsOnLink] = useState(false);
	const [visible, setVisible] = useState(false);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const mouseIsDown = useRef(false);

	// Local formatting state — tracked from this editor's selection, not the shared store
	const [isBold, setIsBold] = useState(false);
	const [isItalic, setIsItalic] = useState(false);
	const [isUnderline, setIsUnderline] = useState(false);
	const [isStrikethrough, setIsStrikethrough] = useState(false);
	const [isSubscript, setIsSubscript] = useState(false);
	const [isSuperscript, setIsSuperscript] = useState(false);
	const [isList, setIsList] = useState(false);
	const [listType, setListType] = useState<
		"bullet" | "number" | "check" | null
	>(null);

	// Derive button visibility from TOOLBAR_CONFIGS — mirrors the main Toolbar component
	const config = TOOLBAR_CONFIGS[toolbar];

	const showBold = config.formatting.bold;
	const showItalic = toolbar !== "none";
	const showUnderline = config.formatting.underline;
	const showStrikethrough = config.formatting.strikethrough;
	const showSubscriptSuperscript = config.formatting.subscript;
	const showClearFormatting = config.features.clearFormatting;
	const showList = config.blocks.lists;
	const showIndentOutdent = config.features.indentOutdent;
	const showAlignment = config.features.alignment;

	// Count visible buttons to decide whether to render at all
	const visibleButtonCount =
		(showBold ? 1 : 0) +
		(showItalic ? 1 : 0) +
		(showUnderline ? 1 : 0) +
		(showStrikethrough ? 1 : 0) +
		(showSubscriptSuperscript ? 2 : 0) +
		(showClearFormatting ? 1 : 0) +
		(showList ? 1 : 0) +
		(showIndentOutdent ? 2 : 0) +
		(showAlignment ? 1 : 0) +
		(showLinks ? 1 : 0);

	const updateToolbar = useCallback(() => {
		const selection = $getSelection();

		if (
			!$isRangeSelection(selection) ||
			selection.isCollapsed() ||
			!editor.isEditable()
		) {
			setPosition(null);
			setVisible(false);
			return;
		}

		// Don't show while mouse is held down (user is still dragging)
		if (mouseIsDown.current) return;

		// Check if selection is within a LinkNode
		const node = selection.anchor.getNode();
		const parent = node.getParent();
		const onLink = $isLinkNode(node) || (parent != null && $isLinkNode(parent));
		setIsOnLink(onLink);

		// Read formatting state from this editor's selection
		setIsBold(selection.hasFormat("bold"));
		setIsItalic(selection.hasFormat("italic"));
		setIsUnderline(selection.hasFormat("underline"));
		setIsStrikethrough(selection.hasFormat("strikethrough"));
		setIsSubscript(selection.hasFormat("subscript"));
		setIsSuperscript(selection.hasFormat("superscript"));

		// Detect list state by traversing up from anchor node
		let foundList = false;
		let foundListType: "bullet" | "number" | "check" | null = null;
		const anchorNode = selection.anchor.getNode();
		let currentNode = anchorNode;
		while (currentNode) {
			if ($isListItemNode(currentNode)) {
				foundList = true;
				const listParent = currentNode.getParent();
				if ($isListNode(listParent)) {
					const lexicalListType = listParent.getListType();
					foundListType =
						lexicalListType === "number"
							? "number"
							: lexicalListType === "check"
								? "check"
								: "bullet";
				}
				break;
			}
			const p = currentNode.getParent();
			if (!p) break;
			currentNode = p;
		}
		setIsList(foundList);
		setListType(foundListType);
	}, [editor]);

	const updatePosition = useCallback(() => {
		if (linkEditor?.state.isOpen || mouseIsDown.current) {
			setPosition(null);
			setVisible(false);
			return;
		}

		const nativeSelection = window.getSelection();
		if (
			!nativeSelection ||
			nativeSelection.rangeCount === 0 ||
			nativeSelection.isCollapsed
		) {
			setPosition(null);
			setVisible(false);
			return;
		}

		const container = editor
			.getRootElement()
			?.closest(".editor-container") as HTMLElement | null;
		if (!container) {
			setPosition(null);
			setVisible(false);
			return;
		}

		const range = nativeSelection.getRangeAt(0);
		const rects = range.getClientRects();
		if (rects.length === 0) {
			setPosition(null);
			setVisible(false);
			return;
		}

		const containerRect = container.getBoundingClientRect();

		// Position centred above the selection (matching CanvaDocs reference behaviour)
		const startRect = rects[0];
		const endRect = rects[rects.length - 1];
		const selLeft = Math.min(startRect.left, endRect.left);
		const selRight = Math.max(startRect.right, endRect.right);

		// Vertical: above the selection start, with gap
		let top = startRect.top - containerRect.top - TOOLBAR_HEIGHT - TOOLBAR_GAP;

		// Horizontal: set left to selection midpoint — CSS translateX(-50%) handles centering
		const left = selLeft - containerRect.left + (selRight - selLeft) / 2;

		// Flip below if it would overflow the top of the container or overlap the main toolbar
		const mainToolbar = container.querySelector(".editor-toolbar");
		const mainToolbarBottom = mainToolbar
			? mainToolbar.getBoundingClientRect().bottom - containerRect.top
			: 0;

		if (top < mainToolbarBottom) {
			// Position below the selection end instead
			top = endRect.bottom - containerRect.top + TOOLBAR_GAP;
		}

		setPosition({ top, left });
		setVisible(true);
	}, [editor, linkEditor?.state.isOpen]);

	// Track mouse state to only show toolbar on release, not during drag
	useEffect(() => {
		const rootElement = editor.getRootElement();
		if (!rootElement) return;

		const handleMouseDown = () => {
			mouseIsDown.current = true;
			setVisible(false);
			setPosition(null);
		};
		const handleMouseUp = (e: MouseEvent) => {
			mouseIsDown.current = false;

			// Don't reposition if the mouseup was on the main toolbar — the user
			// is clicking a toolbar button, not making a new selection
			const target = e.target as HTMLElement;
			if (
				target.closest('[role="toolbar"]') ||
				target.closest(".editor-toolbar")
			) {
				return;
			}

			requestAnimationFrame(() => {
				editor.getEditorState().read(() => {
					updateToolbar();
				});
				updatePosition();
			});
		};

		rootElement.addEventListener("mousedown", handleMouseDown);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			rootElement.removeEventListener("mousedown", handleMouseDown);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [editor, updateToolbar, updatePosition]);

	// Listen for selection changes
	useEffect(() => {
		return editor.registerCommand(
			SELECTION_CHANGE_COMMAND,
			() => {
				editor.getEditorState().read(() => {
					updateToolbar();
				});
				updatePosition();
				return false;
			},
			1
		);
	}, [editor, updateToolbar, updatePosition]);

	// Listen for editor updates
	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				updateToolbar();
			});
			updatePosition();
		});
	}, [editor, updateToolbar, updatePosition]);

	const handleClick = useCallback(() => {
		if (!linkEditor) return;

		editor.getEditorState().read(() => {
			const selection = $getSelection();
			if (!$isRangeSelection(selection)) return;

			const clonedSelection = selection.clone();
			const node = selection.anchor.getNode();
			const parent = node.getParent();

			let linkNode = null;
			if ($isLinkNode(node)) {
				linkNode = node;
			} else if (parent && $isLinkNode(parent)) {
				linkNode = parent;
			}

			if (linkNode) {
				linkEditor.openLinkEditor({
					url: linkNode.getURL(),
					hasSelection: true,
					isEditing: true,
					selection: clonedSelection,
					linkNodeKey: linkNode.getKey(),
				});
			} else {
				linkEditor.openLinkEditor({
					hasSelection: !selection.isCollapsed(),
					isEditing: false,
					selection: clonedSelection,
				});
			}
		});
	}, [editor, linkEditor]);

	const handleClearFormatting = useCallback(() => {
		editor.update(() => {
			const selection = $getSelection();
			if ($isRangeSelection(selection)) {
				selection.getNodes().forEach((node) => {
					if ($isTextNode(node)) {
						node.setFormat(0);
					}
				});
			}
		});
	}, [editor]);

	if (
		!position ||
		!visible ||
		linkEditor?.state.isOpen ||
		visibleButtonCount <= 1
	) {
		return null;
	}

	const btnClass = (active: boolean) =>
		`flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm transition-colors ${
			active
				? "bg-accent text-accent-foreground"
				: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
		}`;

	// Track whether we need a separator before the next group
	const hasFormatButtons =
		showBold || showItalic || showUnderline || showStrikethrough;
	const hasSubSuperClear = showSubscriptSuperscript || showClearFormatting;
	const hasStructureButtons = showList || showIndentOutdent || showAlignment;

	// Get the list icon based on current list type
	const ListIcon =
		listType === "number"
			? ListOrdered
			: listType === "check"
				? ListChecks
				: List;

	// Get the alignment icon based on current state
	const alignmentState = editorStore.state.textAlignment;
	const AlignIcon =
		alignmentState === "center"
			? AlignCenter
			: alignmentState === "right"
				? AlignRight
				: alignmentState === "justify"
					? AlignJustify
					: AlignLeft;

	return (
		<div
			ref={toolbarRef}
			className="absolute z-10 flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-1 shadow-lg transition-opacity duration-150 dark:border-gray-700 dark:bg-gray-800"
			style={{
				top: position.top,
				left: position.left,
				transform: "translateX(-50%)",
				opacity: visible ? 1 : 0,
			}}
			role="toolbar"
			aria-label="Floating formatting toolbar"
			onMouseDown={(e) => {
				e.preventDefault();
				// List, indent and alignment go through the shared store's active editor,
				// so make sure that is this editor before the click handler runs
				editorStore.initLexicalEditor(editor, editorKey);
			}}
		>
			{showBold && (
				<button
					type="button"
					className={btnClass(isBold)}
					onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
					aria-label="Bold"
					aria-pressed={isBold}
				>
					<Bold className="h-3.5 w-3.5" />
				</button>
			)}
			{showItalic && (
				<button
					type="button"
					className={btnClass(isItalic)}
					onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
					aria-label="Italic"
					aria-pressed={isItalic}
				>
					<Italic className="h-3.5 w-3.5" />
				</button>
			)}
			{showUnderline && (
				<button
					type="button"
					className={btnClass(isUnderline)}
					onClick={() =>
						editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
					}
					aria-label="Underline"
					aria-pressed={isUnderline}
				>
					<Underline className="h-3.5 w-3.5" />
				</button>
			)}
			{showStrikethrough && (
				<button
					type="button"
					className={btnClass(isStrikethrough)}
					onClick={() =>
						editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
					}
					aria-label="Strikethrough"
					aria-pressed={isStrikethrough}
				>
					<Strikethrough className="h-3.5 w-3.5" />
				</button>
			)}

			{/* Separator between format buttons and sub/super/clear */}
			{hasFormatButtons && hasSubSuperClear && (
				<div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-gray-600" />
			)}

			{showSubscriptSuperscript && (
				<>
					<button
						type="button"
						className={btnClass(isSubscript)}
						onClick={() =>
							editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript")
						}
						aria-label="Subscript"
						aria-pressed={isSubscript}
					>
						<Subscript className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						className={btnClass(isSuperscript)}
						onClick={() =>
							editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript")
						}
						aria-label="Superscript"
						aria-pressed={isSuperscript}
					>
						<Superscript className="h-3.5 w-3.5" />
					</button>
				</>
			)}
			{showClearFormatting && (
				<button
					type="button"
					className={btnClass(false)}
					onClick={handleClearFormatting}
					aria-label="Clear formatting"
				>
					<RemoveFormatting className="h-3.5 w-3.5" />
				</button>
			)}

			{/* Separator between formatting and structure buttons */}
			{(hasFormatButtons || hasSubSuperClear) && hasStructureButtons && (
				<div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-gray-600" />
			)}

			{/* List cycling button */}
			{showList && (
				<button
					type="button"
					className={btnClass(isList)}
					onClick={() => editorStore.toggleList()}
					aria-label={
						isList
							? listType === "number"
								? "Numbered List"
								: listType === "check"
									? "Checklist"
									: "Bullet List"
							: "List"
					}
					aria-pressed={isList}
				>
					<ListIcon className="h-3.5 w-3.5" />
				</button>
			)}

			{/* Indent/Outdent buttons */}
			{showIndentOutdent && (
				<>
					<button
						type="button"
						className={btnClass(false)}
						onClick={() => editorStore.decreaseIndent()}
						aria-label="Decrease indent"
					>
						<Outdent className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						className={btnClass(false)}
						onClick={() => editorStore.increaseIndent()}
						aria-label="Increase indent"
					>
						<Indent className="h-3.5 w-3.5" />
					</button>
				</>
			)}

			{/* Alignment cycling button */}
			{showAlignment && (
				<button
					type="button"
					className={btnClass(false)}
					onClick={() => {
						const alignments: Array<"left" | "center" | "right" | "justify"> = [
							"left",
							"center",
							"right",
							"justify",
						];
						const currentIndex = alignments.indexOf(alignmentState);
						const nextIndex = (currentIndex + 1) % alignments.length;
						editorStore.setTextAlignment(alignments[nextIndex]);
					}}
					aria-label={`Align ${alignmentState}`}
				>
					<AlignIcon className="h-3.5 w-3.5" />
				</button>
			)}

			{/* Separator before link button */}
			{showLinks &&
				(hasFormatButtons || hasSubSuperClear || hasStructureButtons) && (
					<div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-gray-600" />
				)}

			{showLinks && (
				<button
					type="button"
					className={btnClass(isOnLink)}
					onClick={handleClick}
					aria-label={isOnLink ? "Edit Link" : "Add Link"}
					aria-pressed={isOnLink}
				>
					<LinkIcon className="h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
};
