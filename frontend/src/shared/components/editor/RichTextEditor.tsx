/**
 * RichTextEditor Component
 *
 * Main editable rich text component built on Lexical.
 * Supports multiple toolbar configurations, word limits, and React Hook Form integration.
 */

import React, { useEffect, useId, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { getNodesForMode } from "./toolbar/toolbar-nodes";
import { TOOLBAR_CONFIGS } from "./toolbar/toolbar-configs";

import type { RichTextEditorProps } from "@/shared/types/editor.types";
import { cn } from "@/shared/lib/utils";
import { editorTheme } from "./theme";
import { OnChangePlugin } from "./plugins/OnChangePlugin";
import { PrepopulateHTMLPlugin } from "./plugins/PrepopulateHTMLPlugin";
import { ControlledValuePlugin } from "./plugins/ControlledValuePlugin";
import { AutoLinkPlugin } from "./plugins/AutoLinkPlugin";
import { AutoFocusPlugin } from "./plugins/AutoFocusPlugin";
import { TabIndentationPlugin } from "./plugins/TabIndentationPlugin";
import { WordCountPlugin } from "./plugins/WordCountPlugin";
import { PreventAutoFocusPlugin } from "./plugins/PreventAutoFocusPlugin";
import { SubscriptSuperscriptPlugin } from "./plugins/SubscriptSuperscriptPlugin";
import { SaveOnCtrlSPlugin } from "./plugins/SaveOnCtrlSPlugin";
import { DragDropPlugin } from "./plugins/DragDropPlugin";
import { PastePlugin } from "./plugins/PastePlugin";
import { ListMaxIndentPlugin } from "./plugins/ListMaxIndentPlugin";
import { RemoveEmptyListItemsPlugin } from "./plugins/RemoveEmptyListItemsPlugin";
import { EditorStoreIntegrationPlugin } from "./plugins/EditorStoreIntegrationPlugin";
import { MoveCursorToEndPlugin } from "./plugins/MoveCursorToEndPlugin";
import { Toolbar } from "./toolbar/Toolbar";
import { LinkEditorProvider } from "./toolbar/LinkEditorContext";
import { useLinkEditor } from "./toolbar/link-editor.utils";
import { InlineLinkForm } from "./toolbar/InlineLinkForm";
import { FloatingLinkToolbar } from "./plugins/FloatingLinkToolbar";
import { LinkClickPlugin } from "./plugins/LinkClickPlugin";
import "@/shared/styles/editor.css";

// Plugin to make editor editable on user interaction
const EditableOnInteractionPlugin: React.FC<{ shouldBeEditable: boolean }> = ({
	shouldBeEditable,
}) => {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!shouldBeEditable) return;

		const rootElement = editor.getRootElement();
		if (!rootElement) return;

		const makeEditable = (event: Event) => {
			if (!editor.isEditable()) {
				// Prevent default to stop browser from setting cursor position
				event.preventDefault();

				// Restore focusability
				rootElement.setAttribute("tabindex", "0");

				// Make editable without triggering onChange by using a special tag
				editor.setEditable(true);

				// Force an update with a special tag to signal this is just becoming editable
				editor.update(() => {}, { tag: "becoming-editable" });
			}
		};

		// Make editable on click or focus
		rootElement.addEventListener("click", makeEditable);
		rootElement.addEventListener("focusin", makeEditable);

		// CRITICAL: Delay making the editor focusable to prevent auto-focus during initialization
		// This ensures all editors have mounted and content has been populated before any can receive focus
		const timeoutId = setTimeout(() => {
			// Editor is now ready to receive focus from user interaction
		}, 600);

		return () => {
			clearTimeout(timeoutId);
			rootElement.removeEventListener("click", makeEditable);
			rootElement.removeEventListener("focusin", makeEditable);
		};
	}, [editor, shouldBeEditable]);

	return null;
};

/**
 * Inner wrapper that reads LinkEditorContext to drive the slide animation.
 * Must be rendered inside LinkEditorProvider so useLinkEditor() returns context.
 */
const ContentSliderWrapper = ({
	children,
	linkPanel,
	containerRef,
}: {
	children: React.ReactNode;
	linkPanel: React.ReactNode;
	containerRef?: React.RefObject<HTMLDivElement | null>;
}) => {
	const linkEditor = useLinkEditor();
	const isOpen = linkEditor?.state.isOpen ?? false;

	// Set data attribute on the editor-container for CSS sibling hiding
	React.useEffect(() => {
		const container = containerRef?.current;
		if (!container) return;
		if (isOpen) {
			container.setAttribute("data-link-panel-open", "");
		} else {
			container.removeAttribute("data-link-panel-open");
		}
	}, [isOpen, containerRef]);

	return (
		<div className="relative">
			{/* Editor content — always rendered to preserve Lexical state */}
			<div
				className={cn(
					isOpen && "opacity-0 pointer-events-none h-0 overflow-hidden"
				)}
				aria-hidden={isOpen}
			>
				{children}
			</div>
			{/* Link panel — replaces the editor when open */}
			{isOpen && <div>{linkPanel}</div>}
		</div>
	);
};

/**
 * Notifies the parent when the link panel open state changes.
 */
const LinkPanelStateNotifier = ({
	onChange,
}: {
	onChange?: (isOpen: boolean) => void;
}) => {
	const linkEditor = useLinkEditor();
	const isOpen = linkEditor?.state.isOpen ?? false;

	React.useEffect(() => {
		onChange?.(isOpen);
	}, [isOpen, onChange]);

	return null;
};

/**
 * Conditionally renders DragDropPlugin — hidden when the inline link panel is open.
 */
const ConditionalDragDrop = () => {
	const linkEditor = useLinkEditor();
	if (linkEditor?.state.isOpen) return null;
	return <DragDropPlugin />;
};

export const RichTextEditor = React.forwardRef<
	HTMLDivElement,
	RichTextEditorProps
>(
	(
		{
			value,
			onChange,
			onBaselineChange,
			onSave,
			placeholder = "Enter text...",
			readOnly = false,
			disabled = false,
			autoFocus = false,
			moveCursorToEnd = false,
			toolbar = "full",
			floatingToolbar = true,
			wordLimit,
			limitCanBePassed: _limitCanBePassed = false,
			className = "",
			minHeight = "150px",
			"aria-label": ariaLabel,
			"aria-describedby": ariaDescribedby,
			"aria-invalid": ariaInvalid,
			onLinkPanelChange,
		},
		ref
	) => {
		const [_currentContent, setCurrentContent] = useState(value || "");
		const containerRef = React.useRef<HTMLDivElement>(null);
		const handleError = (error: Error) => {
			console.error("[RichTextEditor] Lexical error:", error);
		};

		const handleContentChange = (html: string) => {
			setCurrentContent(html);
			onChange?.(html);
		};

		const shouldBeEditable = !readOnly && !disabled;
		const shouldStartEditable =
			shouldBeEditable && (autoFocus || moveCursorToEnd);
		const showLinks = TOOLBAR_CONFIGS[toolbar].features.links;

		const editorKey = useId();

		const initialConfig = {
			namespace: "RichTextEditor",
			editable: shouldStartEditable, // Start editable if autoFocus or moveCursorToEnd
			theme: editorTheme,
			onError: handleError,
			nodes: getNodesForMode(toolbar),
		};

		return (
			<div
				ref={(node) => {
					containerRef.current = node;
					if (typeof ref === "function") ref(node);
					else if (ref)
						(ref as React.MutableRefObject<HTMLDivElement | null>).current =
							node;
				}}
				className={`editor-container ${readOnly ? "editor-readonly" : ""} transition-all duration-300 ${className}`}
			>
				<LexicalComposer initialConfig={initialConfig}>
					<LinkEditorProvider>
						<LinkPanelStateNotifier onChange={onLinkPanelChange} />
						{/* Content area — editor swaps with link panel */}
						<ContentSliderWrapper
							linkPanel={!readOnly && showLinks ? <InlineLinkForm /> : null}
							containerRef={containerRef}
						>
							{/* Toolbar - slides with editor content */}
							{!readOnly && toolbar !== "none" && (
								<Toolbar
									mode={toolbar}
									disabled={disabled}
									editorKey={editorKey}
								/>
							)}

							<div className="editor-content-wrapper">
								<RichTextPlugin
									contentEditable={
										<ContentEditable
											className="editor-input"
											style={{ minHeight }}
											role="textbox"
											aria-label={ariaLabel}
											aria-describedby={ariaDescribedby}
											aria-multiline="true"
											aria-readonly={readOnly}
											aria-invalid={ariaInvalid}
											contentEditable={!readOnly && !disabled}
											// Prevent auto-focus during initialisation
											tabIndex={readOnly ? -1 : 0}
										/>
									}
									placeholder={
										!readOnly ? (
											<div className="editor-placeholder" aria-hidden="false">
												{placeholder}
											</div>
										) : null
									}
									ErrorBoundary={LexicalErrorBoundary}
								/>
							</div>
						</ContentSliderWrapper>

						{/* Floating toolbar — appears near text selection */}
						{!readOnly && toolbar !== "none" && floatingToolbar && (
							<FloatingLinkToolbar
								showLinks={showLinks}
								toolbar={toolbar}
								editorKey={editorKey}
							/>
						)}

						{/* Plugins */}
						<HistoryPlugin />
						<ListPlugin />
						<CheckListPlugin />
						<ListMaxIndentPlugin maxDepth={9} />
						<RemoveEmptyListItemsPlugin />
						<LinkPlugin />
						<AutoLinkPlugin />
						{!readOnly && showLinks && <LinkClickPlugin />}
						<TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} />
						<TabIndentationPlugin />
						{/* PreventAutoFocusPlugin must come before EditableOnInteractionPlugin */}
						<PreventAutoFocusPlugin />
						<EditableOnInteractionPlugin shouldBeEditable={shouldBeEditable} />
						<SubscriptSuperscriptPlugin />
						<SaveOnCtrlSPlugin onSave={onSave} />
						<PastePlugin mode={toolbar} />
						{!readOnly && <ConditionalDragDrop />}
						{autoFocus && <AutoFocusPlugin />}
						{moveCursorToEnd && <MoveCursorToEndPlugin />}
						<OnChangePlugin
							onChange={handleContentChange}
							onBaselineChange={onBaselineChange}
						/>
						{/* PrepopulateHTMLPlugin handles initial content loading ONCE */}
						<PrepopulateHTMLPlugin html={value} />
						{/* ControlledValuePlugin handles subsequent value prop changes (Clear, Reset, etc.) */}
						<ControlledValuePlugin value={value} />
						{wordLimit && <WordCountPlugin wordLimit={wordLimit} />}
						{/* EditorStore integration - must come after other plugins */}
						<EditorStoreIntegrationPlugin editorKey={editorKey} />
					</LinkEditorProvider>
				</LexicalComposer>
			</div>
		);
	}
);

RichTextEditor.displayName = "RichTextEditor";
