/**
 * EditorStoreIntegrationPlugin Tests
 *
 * The shared EditorStore routes toolbar commands to one active editor. These
 * tests cover how an editor claims and gives up that role, including the case
 * where it is focused while mounting (before the plugin's listeners exist).
 */

import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createEditor } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { EditorStore } from "@/app/stores/derived/editor.store";
import { EditorStoreIntegrationPlugin } from "./EditorStoreIntegrationPlugin";

const storeHolder = vi.hoisted(() => ({
	current: undefined as EditorStore | undefined,
}));

vi.mock("@/app/stores/store-context", () => ({
	useEditorStore: () => storeHolder.current,
}));

vi.mock("@/shared/services/logger.service", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * Focuses the content editable from an effect that runs before the
 * integration plugin's effect, the way loading initial content does.
 */
const FocusDuringMountPlugin = () => {
	const [editor] = useLexicalComposerContext();
	useEffect(() => {
		editor.getRootElement()?.focus();
	}, [editor]);
	return null;
};

const TestEditor = ({
	editorKey,
	focusOnMount = false,
}: {
	editorKey: string;
	focusOnMount?: boolean;
}) => (
	<LexicalComposer
		initialConfig={{
			namespace: editorKey,
			onError: (error: Error) => {
				throw error;
			},
		}}
	>
		<RichTextPlugin
			contentEditable={
				<ContentEditable tabIndex={0} aria-label={`Editor ${editorKey}`} />
			}
			placeholder={null}
			ErrorBoundary={LexicalErrorBoundary}
		/>
		{focusOnMount && <FocusDuringMountPlugin />}
		<EditorStoreIntegrationPlugin editorKey={editorKey} />
	</LexicalComposer>
);

describe("EditorStoreIntegrationPlugin", () => {
	let store: EditorStore;

	beforeEach(() => {
		store = new EditorStore();
		storeHolder.current = store;
	});

	/** Simulates a previously used editor that the store still points at */
	const activateStaleEditor = () => {
		store.initLexicalEditor(createEditor({ namespace: "stale" }), "stale");
	};

	it("becomes active on mount when no other editor is active", () => {
		render(<TestEditor editorKey="fresh" />);

		expect(store.activeEditorKey).toBe("fresh");
	});

	it("becomes active when it is focused while mounting", () => {
		activateStaleEditor();

		render(<TestEditor editorKey="fresh" focusOnMount />);

		expect(store.activeEditorKey).toBe("fresh");
	});

	it("does not take over from an active editor when mounted without focus", () => {
		activateStaleEditor();

		render(<TestEditor editorKey="fresh" />);

		expect(store.activeEditorKey).toBe("stale");
	});

	it("becomes active when it receives focus after mounting", () => {
		activateStaleEditor();
		render(<TestEditor editorKey="fresh" />);

		screen.getByLabelText("Editor fresh").focus();

		expect(store.activeEditorKey).toBe("fresh");
	});

	it("releases the store when it unmounts", () => {
		const { unmount } = render(<TestEditor editorKey="fresh" focusOnMount />);
		expect(store.activeEditorKey).toBe("fresh");

		unmount();

		expect(store.activeEditorKey).toBeNull();
	});

	it("leaves another active editor in place when it unmounts", () => {
		const { unmount } = render(<TestEditor editorKey="fresh" />);
		activateStaleEditor();

		unmount();

		expect(store.activeEditorKey).toBe("stale");
	});
});
