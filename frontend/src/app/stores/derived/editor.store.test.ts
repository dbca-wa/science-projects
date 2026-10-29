import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
	type LexicalEditor,
} from "lexical";
import {
	$isListNode,
	ListItemNode,
	ListNode,
	registerList,
} from "@lexical/list";
import { EditorStore } from "./editor.store";

vi.mock("@/shared/services/logger.service", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

/**
 * A real Lexical editor with list support, mounted on a content editable and
 * holding one paragraph with the caret at its end.
 */
function createListEditor(text: string): {
	editor: LexicalEditor;
	cleanup: () => void;
} {
	const editor = createEditor({
		namespace: `test-${text}`,
		nodes: [ListNode, ListItemNode],
		onError: (error) => {
			throw error;
		},
	});
	const root = document.createElement("div");
	root.contentEditable = "true";
	document.body.appendChild(root);
	editor.setRootElement(root);
	const unregisterList = registerList(editor);
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append($createTextNode(text));
			$getRoot().clear().append(paragraph);
			paragraph.selectEnd();
		},
		{ discrete: true }
	);
	return {
		editor,
		cleanup: () => {
			unregisterList();
			editor.setRootElement(null);
			root.remove();
		},
	};
}

/** Lexical commits command updates in a microtask */
const flushUpdates = () => new Promise((resolve) => setTimeout(resolve, 0));

const isFirstBlockList = (editor: LexicalEditor): boolean =>
	editor.getEditorState().read(() => $isListNode($getRoot().getFirstChild()));

describe("EditorStore", () => {
	let store: EditorStore;

	beforeEach(() => {
		store = new EditorStore();
	});

	it("should start with no open editors", () => {
		expect(store.openEditorsCount).toBe(0);
	});

	it("should not have dialog open initially", () => {
		expect(store.isDialogOpen).toBe(false);
	});

	it("should not have pending action initially", () => {
		expect(store.pendingAction).toBeNull();
	});

	it("openEditor should increment open editors count", () => {
		store.openEditor();
		expect(store.openEditorsCount).toBe(1);
	});

	it("closeEditor should decrement open editors count", () => {
		store.openEditor();
		store.openEditor();
		store.closeEditor();
		expect(store.openEditorsCount).toBe(1);
	});

	it("closeEditor should not go below 0", () => {
		store.closeEditor();
		expect(store.openEditorsCount).toBe(0);
	});

	it("setDialogOpen should update dialog state", () => {
		store.setDialogOpen(true);
		expect(store.isDialogOpen).toBe(true);
		store.setDialogOpen(false);
		expect(store.isDialogOpen).toBe(false);
	});

	it("setPendingAction should store the action", () => {
		const action = vi.fn();
		store.setPendingAction(action);
		expect(store.pendingAction).not.toBeNull();
		expect(typeof store.pendingAction).toBe("function");
	});

	it("setPendingAction with null should clear the action", () => {
		store.setPendingAction(vi.fn());
		store.setPendingAction(null);
		expect(store.pendingAction).toBeNull();
	});

	it("reset should clear all state", () => {
		store.openEditor();
		store.setDialogOpen(true);
		store.setPendingAction(vi.fn());
		store.reset();
		expect(store.openEditorsCount).toBe(0);
		expect(store.isDialogOpen).toBe(false);
		expect(store.pendingAction).toBeNull();
	});

	it("shouldBlockNavigation should return false when no editors open", () => {
		expect(store.shouldBlockNavigation("/a", "/b")).toBe(false);
	});

	it("shouldBlockNavigation should return true when editors are open", () => {
		store.openEditor();
		expect(store.shouldBlockNavigation("/a", "/b")).toBe(true);
	});

	it("shouldBlockNavigation should return false for same path", () => {
		store.openEditor();
		expect(store.shouldBlockNavigation("/a", "/a")).toBe(false);
	});

	describe("toolbar command routing", () => {
		let first: ReturnType<typeof createListEditor>;
		let second: ReturnType<typeof createListEditor>;

		beforeEach(() => {
			first = createListEditor("First editor");
			second = createListEditor("Second editor");
		});

		afterEach(() => {
			first.cleanup();
			second.cleanup();
		});

		it("applies the list command to the active editor only", async () => {
			store.initLexicalEditor(first.editor, "first");
			store.toggleList();
			await flushUpdates();

			expect(isFirstBlockList(first.editor)).toBe(true);
			expect(isFirstBlockList(second.editor)).toBe(false);
		});

		it("switches commands to an editor once it is activated", async () => {
			store.initLexicalEditor(first.editor, "first");
			store.initLexicalEditor(second.editor, "second");
			store.toggleList();
			await flushUpdates();

			expect(store.activeEditorKey).toBe("second");
			expect(isFirstBlockList(second.editor)).toBe(true);
			expect(isFirstBlockList(first.editor)).toBe(false);
		});

		it("releases an unmounted editor so commands are not sent to it", async () => {
			store.initLexicalEditor(first.editor, "first");
			store.releaseLexicalEditor(first.editor);
			store.toggleList();
			await flushUpdates();

			expect(store.activeEditorKey).toBeNull();
			expect(isFirstBlockList(first.editor)).toBe(false);
		});

		it("ignores a release from an editor that is not active", () => {
			store.initLexicalEditor(first.editor, "first");
			store.releaseLexicalEditor(second.editor);

			expect(store.activeEditorKey).toBe("first");
		});

		it("clears toolbar state when the active editor is released", async () => {
			store.initLexicalEditor(first.editor, "first");
			store.toggleList();
			await flushUpdates();
			expect(store.state.isList).toBe(true);

			store.releaseLexicalEditor(first.editor);

			expect(store.state.isList).toBe(false);
			expect(store.state.listType).toBeNull();
			expect(store.state.canUndo).toBe(false);
		});
	});
});
