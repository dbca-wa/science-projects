/**
 * Toolbar Component
 *
 * Formatting controls for the rich text editor.
 * Pure renderer of TOOLBAR_CONFIGS — no embedded knowledge of what a mode allows.
 * Uses EditorStore for state management.
 */

import React, { useRef } from "react";
import { observer } from "mobx-react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEditorStore } from "@/app/stores/store-context";
import type { ToolbarProps } from "@/shared/types/editor.types";
import { FormatButton } from "./FormatButton";
import { HeadingSelect } from "./HeadingSelect";
import { UnifiedListButton } from "./UnifiedListButton";
import { LinkButton } from "./LinkButton";
import { SubscriptButton } from "./SubscriptButton";
import { SuperscriptButton } from "./SuperscriptButton";
import { ClearFormattingButton } from "./ClearFormattingButton";
import { UndoRedoButtons } from "./UndoRedoButtons";
import { IndentButton } from "./IndentButton";
import { OutdentButton } from "./OutdentButton";
import { AlignmentButton } from "./AlignmentButton";
import { StrikethroughButton } from "./StrikethroughButton";
import { TableButton } from "./TableButton";
import { ImageButton } from "./ImageButton";
import { ToolbarDarkModeContext } from "./ToolbarContext";
import { TOOLBAR_CONFIGS } from "./toolbar-configs";

export const Toolbar: React.FC<ToolbarProps> = observer(
	({ mode, disabled = false, editorKey }) => {
		const editorStore = useEditorStore();
		const [editor] = useLexicalComposerContext();
		const toolbarRef = useRef<HTMLDivElement>(null);

		if (mode === "none") {
			return null;
		}

		// Toolbar commands are routed through the shared store's active editor.
		// Make this toolbar's own editor the active one before any button acts, so a
		// click never lands on another open (or already destroyed) editor.
		const activateOwnEditor = () => {
			editorStore.initLexicalEditor(editor, editorKey);
		};

		const config = TOOLBAR_CONFIGS[mode];

		// Only show active formatting states when this toolbar's editor is the active one
		const isActiveEditor =
			!editorKey || editorStore.activeEditorKey === editorKey;

		// Scoped state — only reflects formatting when this editor is active
		const s = isActiveEditor
			? editorStore.state
			: {
					isBold: false,
					isItalic: false,
					isUnderline: false,
					isStrikethrough: false,
					isSubscript: false,
					isSuperscript: false,
					canUndo: false,
					canRedo: false,
					blockType: "paragraph" as const,
					isList: false,
					listType: null as null,
					isLink: false,
					indentLevel: 0,
					maxIndent: 7,
					textAlignment: "left" as const,
				};

		// Arrow key navigation handler
		const handleKeyDown = (e: React.KeyboardEvent) => {
			if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
				return;
			}

			e.preventDefault();

			const buttons = toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
				"button:not([disabled])"
			);

			if (!buttons || buttons.length === 0) return;

			const currentIndex = Array.from(buttons).indexOf(
				document.activeElement as HTMLButtonElement
			);

			let nextIndex: number;

			switch (e.key) {
				case "ArrowLeft":
					nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
					break;
				case "ArrowRight":
					nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
					break;
				case "Home":
					nextIndex = 0;
					break;
				case "End":
					nextIndex = buttons.length - 1;
					break;
				default:
					return;
			}

			buttons[nextIndex]?.focus();
		};

		// Profile mode has a different layout: lists and links in the formatting group
		const isProfileLayout = mode === "profile";

		// Cycle through alignment options
		const cycleAlignment = () => {
			const alignments: Array<"left" | "center" | "right" | "justify"> = [
				"left",
				"center",
				"right",
				"justify",
			];
			const currentIndex = alignments.indexOf(s.textAlignment);
			const nextIndex = (currentIndex + 1) % alignments.length;
			editorStore.setTextAlignment(alignments[nextIndex]);
		};

		return (
			<ToolbarDarkModeContext.Provider value={false}>
				<div
					ref={toolbarRef}
					className="editor-toolbar"
					role="toolbar"
					aria-label="Text formatting"
					aria-orientation="horizontal"
					onKeyDown={handleKeyDown}
					onMouseDown={(e) => {
						// Prevent editor blur when clicking anywhere in the toolbar area.
						// Without this, clicking between buttons or on button padding causes
						// the editor to lose focus, clearing the selection and breaking
						// formatting commands.
						e.preventDefault();
						activateOwnEditor();
					}}
					// Keyboard users reach the buttons by tabbing, which skips mousedown
					onFocus={activateOwnEditor}
				>
					{/* Undo/Redo buttons - shown in all modes */}
					<div
						className="editor-toolbar-group"
						role="group"
						aria-label="History"
					>
						<UndoRedoButtons
							canUndo={s.canUndo}
							canRedo={s.canRedo}
							onUndo={editorStore.undo}
							onRedo={editorStore.redo}
							disabled={disabled}
						/>
					</div>

					<div className="editor-toolbar-separator" />

					{/* Format buttons */}
					<div
						className="editor-toolbar-group"
						role="group"
						aria-label="Text formatting"
					>
						{config.formatting.bold && (
							<FormatButton
								format="bold"
								isActive={s.isBold}
								onToggle={() => editorStore.toggleFormat("bold")}
								disabled={disabled}
							/>
						)}
						<FormatButton
							format="italic"
							isActive={s.isItalic}
							onToggle={() => editorStore.toggleFormat("italic")}
							disabled={disabled}
						/>
						{config.formatting.underline && (
							<FormatButton
								format="underline"
								isActive={s.isUnderline}
								onToggle={() => editorStore.toggleFormat("underline")}
								disabled={disabled}
							/>
						)}
						{config.formatting.strikethrough && (
							<StrikethroughButton
								isActive={s.isStrikethrough}
								onToggle={() => editorStore.toggleFormat("strikethrough")}
								disabled={disabled}
							/>
						)}

						{/* Subscript/Superscript buttons */}
						{config.formatting.subscript && (
							<>
								<SubscriptButton
									isActive={s.isSubscript}
									onToggle={() => editorStore.toggleFormat("subscript")}
									disabled={disabled}
								/>
								<SuperscriptButton
									isActive={s.isSuperscript}
									onToggle={() => editorStore.toggleFormat("superscript")}
									disabled={disabled}
								/>
							</>
						)}

						{/* Clear formatting button */}
						{config.features.clearFormatting && (
							<ClearFormattingButton disabled={disabled} />
						)}

						{/* In profile mode, list + link are in the same group */}
						{isProfileLayout && config.blocks.lists && (
							<UnifiedListButton
								isList={s.isList}
								listType={s.listType}
								onCycleList={editorStore.toggleList}
								disabled={disabled}
							/>
						)}
						{isProfileLayout && config.features.links && (
							<LinkButton isActive={s.isLink} disabled={disabled} />
						)}
					</div>

					{/* Separator — only for non-profile modes */}
					{!isProfileLayout &&
						(config.blocks.headings ||
							config.blocks.lists ||
							config.features.links ||
							config.features.indentOutdent ||
							config.features.alignment) && (
							<div className="editor-toolbar-separator" />
						)}

					{/* Heading dropdown */}
					{config.blocks.headings && (
						<HeadingSelect
							blockType={s.blockType}
							onSetBlockType={editorStore.setBlockType}
							disabled={disabled}
						/>
					)}

					{/* List button - unified cycling button */}
					{config.blocks.lists && !isProfileLayout && (
						<UnifiedListButton
							isList={s.isList}
							listType={s.listType}
							onCycleList={editorStore.toggleList}
							disabled={disabled}
						/>
					)}

					{/* Indent/Outdent buttons */}
					{config.features.indentOutdent && (
						<>
							<OutdentButton
								onOutdent={editorStore.decreaseIndent}
								canOutdent={s.indentLevel > 0}
								disabled={disabled}
							/>
							<IndentButton
								onIndent={editorStore.increaseIndent}
								canIndent={s.indentLevel < s.maxIndent}
								disabled={disabled}
							/>
						</>
					)}

					{/* Alignment button */}
					{config.features.alignment && (
						<AlignmentButton
							alignment={s.textAlignment}
							onCycleAlignment={cycleAlignment}
							disabled={disabled}
						/>
					)}

					{/* Link and Table buttons */}
					{((config.features.links && !isProfileLayout) ||
						config.blocks.tables) && (
						<div className="editor-toolbar-separator" />
					)}

					{config.features.links && !isProfileLayout && (
						<LinkButton isActive={s.isLink} disabled={disabled} />
					)}

					{config.blocks.tables && (
						<TableButton
							onInsertTable={editorStore.insertTable}
							disabled={disabled}
						/>
					)}

					{config.features.images && <ImageButton disabled={disabled} />}
				</div>
			</ToolbarDarkModeContext.Provider>
		);
	}
);
