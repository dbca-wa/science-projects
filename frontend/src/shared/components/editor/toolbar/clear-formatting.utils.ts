/**
 * Clear text formatting (bold, italic, underline and the rest) from the
 * current selection. Call inside editor.update().
 *
 * The selection keeps its own format, which toolbars read through
 * selection.hasFormat() and which applies to text typed next. Setting the
 * format on the text nodes alone leaves it unchanged, so the toolbar buttons
 * stay highlighted after clearing. Both are cleared here.
 */

import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";

export const $clearTextFormatting = (): void => {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return;

	for (const node of selection.getNodes()) {
		if ($isTextNode(node)) node.setFormat(0);
	}
	selection.setFormat(0);
};
