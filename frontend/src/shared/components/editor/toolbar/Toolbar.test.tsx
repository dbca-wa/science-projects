/**
 * Toolbar Tests - editor targeting
 *
 * Toolbar buttons send commands through the shared EditorStore. With several
 * editors on a page, a toolbar must always act on its own editor, whichever
 * editor the store last treated as active.
 */

import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type LexicalEditor,
} from "lexical";
import { $isListNode, ListItemNode, ListNode } from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { EditorStore } from "@/app/stores/derived/editor.store";
import { EditorStoreIntegrationPlugin } from "../plugins/EditorStoreIntegrationPlugin";
import { Toolbar } from "./Toolbar";

const storeHolder = vi.hoisted(() => ({
	current: undefined as EditorStore | undefined,
}));

vi.mock("@/app/stores/store-context", () => ({
	useEditorStore: () => storeHolder.current,
}));

vi.mock("@/shared/services/logger.service", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const editors = new Map<string, LexicalEditor>();

/** Loads one paragraph with the caret at its end and exposes the editor */
const SeedPlugin = ({
	editorKey,
	text,
}: {
	editorKey: string;
	text: string;
}) => {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		editor.update(
			() => {
				const paragraph = $createParagraphNode();
				paragraph.append($createTextNode(text));
				$getRoot().clear().append(paragraph);
				paragraph.selectEnd();
			},
			{ discrete: true }
		);
		editors.set(editorKey, editor);
	}, [editor, editorKey, text]);
	return null;
};

const TestEditor = ({
	editorKey,
	text,
}: {
	editorKey: string;
	text: string;
}) => (
	<section aria-label={`Editor ${editorKey}`}>
		<LexicalComposer
			initialConfig={{
				namespace: editorKey,
				nodes: [ListNode, ListItemNode],
				onError: (error: Error) => {
					throw error;
				},
			}}
		>
			<Toolbar mode="full" editorKey={editorKey} />
			<RichTextPlugin
				contentEditable={
					<ContentEditable aria-label={`${editorKey} content`} />
				}
				placeholder={null}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<ListPlugin />
			<SeedPlugin editorKey={editorKey} text={text} />
			<EditorStoreIntegrationPlugin editorKey={editorKey} />
		</LexicalComposer>
	</section>
);

const isFirstBlockList = (editorKey: string): boolean => {
	const editor = editors.get(editorKey);
	if (!editor) throw new Error(`Editor ${editorKey} was not mounted`);
	return editor
		.getEditorState()
		.read(() => $isListNode($getRoot().getFirstChild()));
};

const listButtonFor = (editorKey: string) =>
	within(screen.getByRole("region", { name: `Editor ${editorKey}` })).getByRole(
		"button",
		{ name: "List" }
	);

describe("Toolbar - editor targeting", () => {
	let store: EditorStore;

	beforeEach(() => {
		store = new EditorStore();
		storeHolder.current = store;
		editors.clear();
	});

	it("applies the list button to its own editor when another editor is active", async () => {
		const user = userEvent.setup();
		render(
			<>
				<TestEditor editorKey="first" text="First editor" />
				<TestEditor editorKey="second" text="Second editor" />
			</>
		);
		// The first editor to mount is active in the shared store
		expect(store.activeEditorKey).toBe("first");

		await user.click(listButtonFor("second"));

		await waitFor(() => expect(isFirstBlockList("second")).toBe(true));
		expect(isFirstBlockList("first")).toBe(false);
		expect(store.activeEditorKey).toBe("second");
	});

	it("makes its editor active when a toolbar button receives keyboard focus", () => {
		render(
			<>
				<TestEditor editorKey="first" text="First editor" />
				<TestEditor editorKey="second" text="Second editor" />
			</>
		);

		listButtonFor("second").focus();

		expect(store.activeEditorKey).toBe("second");
	});
});
