/**
 * OnChangePlugin
 *
 * Lexical plugin that tracks content changes and converts editor state to HTML.
 *
 * onChange fires only when editor content actually changes while the editor is
 * editable. Selection/focus-only updates (clicking into a field or moving the
 * cursor between fields), the initial content load, the becoming-editable
 * transition, and programmatic controlled-value syncs are all ignored so they
 * don't register as user edits.
 *
 * onBaselineChange reports the HTML of the initial content load (and any
 * automatic clean-up before the first edit) so callers can tell whether later
 * HTML is genuinely different from what was loaded.
 */

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $generateHtmlFromNodes } from "@lexical/html";
import type { EditorState, NodeKey } from "lexical";

interface OnChangePluginProps {
	onChange?: (html: string) => void;
	/**
	 * Receives the editor's HTML after the editor itself loads or normalises
	 * content (history-merge updates) before the user's first edit. Callers can
	 * compare later edits against exactly what the editor produced for the saved
	 * content, rather than against stored HTML that may be serialised differently.
	 */
	onBaselineChange?: (html: string) => void;
	stripBold?: boolean;
}

/**
 * Strip bold formatting tags (<strong> and <b>) from HTML,
 * preserving the inner content.
 */
function stripBoldTags(html: string): string {
	return html.replace(/<\/?strong[^>]*>/gi, "").replace(/<\/?b[^>]*>/gi, "");
}

// Tags applied to updates that are not user content edits and must not emit
const PROGRAMMATIC_TAGS = [
	"history-merge", // initial content load (PrepopulateHTMLPlugin)
	"becoming-editable", // read-only → editable transition
	"controlled-value-update", // parent programmatically set the value
];

export const OnChangePlugin: React.FC<OnChangePluginProps> = ({
	onChange,
	onBaselineChange,
	stripBold = false,
}) => {
	const [editor] = useLexicalComposerContext();
	// Survives listener re-registration on re-render, resets with the editor
	const hasUserEdited = useRef(false);

	useEffect(() => {
		if (!onChange && !onBaselineChange) return;

		const readHtml = (editorState: EditorState): string =>
			editorState.read(() => {
				const html = $generateHtmlFromNodes(editor);
				return stripBold ? stripBoldTags(html) : html;
			});

		return editor.registerUpdateListener(
			({
				editorState,
				dirtyElements,
				dirtyLeaves,
				tags,
			}: {
				editorState: EditorState;
				dirtyElements: Map<NodeKey, boolean>;
				dirtyLeaves: Set<NodeKey>;
				tags: Set<string>;
			}) => {
				const hasDirtyNodes = dirtyElements.size > 0 || dirtyLeaves.size > 0;

				// Ignore programmatic updates (initial load, becoming editable,
				// controlled-value sync from the parent)
				if (PROGRAMMATIC_TAGS.some((tag) => tags.has(tag))) {
					// Content the editor loaded or normalised itself becomes the
					// baseline, until the user starts editing. Controlled-value syncs
					// are excluded: they come from the parent (e.g. Clear), not the
					// saved content.
					if (
						onBaselineChange &&
						!hasUserEdited.current &&
						hasDirtyNodes &&
						tags.has("history-merge")
					) {
						onBaselineChange(readHtml(editorState));
					}
					return;
				}

				// Ignore selection/focus-only changes — clicking into or between
				// editors mutates no nodes, so there is nothing to report. This is
				// what previously caused clicking between fields to register as an edit.
				if (!hasDirtyNodes) {
					return;
				}

				// Only emit while the editor is editable (ignore any content set
				// while read-only)
				if (!editor.isEditable()) {
					return;
				}

				// Genuine content change (including the first keystroke and undo/redo)
				hasUserEdited.current = true;
				onChange?.(readHtml(editorState));
			}
		);
	}, [editor, onChange, onBaselineChange, stripBold]);

	return null;
};
