import { describe, it, expect } from "vitest";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	createEditor,
	type LexicalEditor,
	type TextFormatType,
} from "lexical";
import { $clearTextFormatting } from "./clear-formatting.utils";

const FORMATS: TextFormatType[] = ["bold", "italic", "underline"];

/** An editor with one paragraph: "plain " then "styled" in bold, italic and underline */
const setUp = async (): Promise<LexicalEditor> => {
	const editor = createEditor({
		namespace: "test",
		onError: (error) => {
			throw error;
		},
	});
	editor.setRootElement(document.createElement("div"));
	await editor.update(
		() => {
			const styled = $createTextNode("styled");
			for (const format of FORMATS) styled.toggleFormat(format);
			$getRoot().append(
				$createParagraphNode().append($createTextNode("plain "), styled)
			);
			// Select the styled word, as a user would. Lexical copies the text's
			// format onto a selection the user makes; do the same here.
			const selection = styled.select(0, styled.getTextContentSize());
			selection.setFormat(styled.getFormat());
		},
		{ discrete: true }
	);
	return editor;
};

const readSelectionFormats = (editor: LexicalEditor) =>
	editor.getEditorState().read(() => {
		const selection = $getSelection();
		if (!$isRangeSelection(selection)) throw new Error("No range selection");
		return FORMATS.filter((format) => selection.hasFormat(format));
	});

const readTextFormats = (editor: LexicalEditor) =>
	editor.getEditorState().read(() =>
		$getRoot()
			.getAllTextNodes()
			.filter($isTextNode)
			.map((node) => FORMATS.filter((format) => node.hasFormat(format)))
	);

describe("$clearTextFormatting", () => {
	it("starts with the selection reporting every format", async () => {
		const editor = await setUp();

		expect(readSelectionFormats(editor)).toEqual(FORMATS);
	});

	it("removes the formatting from the selected text", async () => {
		const editor = await setUp();

		await editor.update($clearTextFormatting, { discrete: true });

		expect(readTextFormats(editor).flat()).toEqual([]);
	});

	it("clears the selection's format, which the toolbar buttons read", async () => {
		const editor = await setUp();

		await editor.update($clearTextFormatting, { discrete: true });

		expect(readSelectionFormats(editor)).toEqual([]);
	});

	it("leaves the text alone when nothing is selected", async () => {
		const editor = await setUp();
		await editor.update(() => $setSelection(null), { discrete: true });

		await editor.update($clearTextFormatting, { discrete: true });

		expect(readTextFormats(editor)).toEqual([[], FORMATS]);
	});
});
