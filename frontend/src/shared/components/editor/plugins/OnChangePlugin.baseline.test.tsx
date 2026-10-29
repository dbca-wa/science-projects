/**
 * OnChangePlugin baseline tests
 *
 * Uses a real Lexical editor. The baseline is the editor's own HTML for the
 * loaded content; callers compare user edits against it to decide whether
 * anything changed.
 */

import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type LexicalEditor,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "./OnChangePlugin";

let capturedEditor: LexicalEditor | null = null;

const CaptureEditorPlugin = () => {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		capturedEditor = editor;
	}, [editor]);
	return null;
};

const getEditor = (): LexicalEditor => {
	if (!capturedEditor) throw new Error("Editor not mounted");
	return capturedEditor;
};

/** Replace the content with one paragraph, tagged like the given update source */
const setParagraph = (text: string, tag?: string) => {
	getEditor().update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(text));
			$getRoot().clear().append(paragraph);
		},
		{ discrete: true, tag }
	);
};

describe("OnChangePlugin - baseline", () => {
	const onChange = vi.fn();
	const onBaselineChange = vi.fn();

	beforeEach(() => {
		onChange.mockClear();
		onBaselineChange.mockClear();
		capturedEditor = null;
		render(
			<LexicalComposer
				initialConfig={{
					namespace: "baseline-test",
					onError: (error: Error) => {
						throw error;
					},
				}}
			>
				<RichTextPlugin
					contentEditable={<ContentEditable aria-label="Test editor" />}
					placeholder={null}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<OnChangePlugin
					onChange={onChange}
					onBaselineChange={onBaselineChange}
				/>
				<CaptureEditorPlugin />
			</LexicalComposer>
		);
	});

	it("reports the loaded content as the baseline without emitting a change", () => {
		setParagraph("Saved text", "history-merge");

		expect(onBaselineChange).toHaveBeenLastCalledWith(
			expect.stringContaining("Saved text")
		);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("emits a user edit as a change, not as a baseline", () => {
		setParagraph("Saved text", "history-merge");
		onBaselineChange.mockClear();

		setParagraph("Edited text");

		expect(onChange).toHaveBeenLastCalledWith(
			expect.stringContaining("Edited text")
		);
		expect(onBaselineChange).not.toHaveBeenCalled();
	});

	it("stops updating the baseline once the user has edited", () => {
		setParagraph("Saved text", "history-merge");
		setParagraph("Edited text");
		onBaselineChange.mockClear();

		// Automatic clean-up after an edit must not become the new baseline
		setParagraph("Cleaned up text", "history-merge");

		expect(onBaselineChange).not.toHaveBeenCalled();
	});

	it("does not take controlled-value updates from the parent as the baseline", () => {
		setParagraph("Saved text", "history-merge");
		onBaselineChange.mockClear();

		setParagraph("", "controlled-value-update");

		expect(onBaselineChange).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
	});
});
