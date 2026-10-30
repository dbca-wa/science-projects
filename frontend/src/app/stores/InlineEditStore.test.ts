import { describe, it, expect, beforeEach } from "vitest";
import { InlineEditStore } from "./InlineEditStore";
import type { ContentType } from "@/shared/types/inline-edit.types";

describe("InlineEditStore", () => {
	let store: InlineEditStore;

	beforeEach(() => {
		store = new InlineEditStore();
	});

	describe("startEdit", () => {
		it("should register editor in store", () => {
			store.startEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
		});

		it("should handle multiple editors", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-outcome", 456);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.isEditing("concept-plan-outcome", 456)).toBe(true);
		});

		it("should handle same content type with different entity IDs", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-aims", 456);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.isEditing("concept-plan-aims", 456)).toBe(true);
		});
	});

	describe("endEdit", () => {
		it("should unregister editor from store", () => {
			store.startEdit("concept-plan-aims", 123);
			store.endEdit("concept-plan-aims", 123);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
		});

		it("should only remove specified editor", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-outcome", 456);

			store.endEdit("concept-plan-aims", 123);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
			expect(store.isEditing("concept-plan-outcome", 456)).toBe(true);
		});

		it("should handle ending edit that was never started", () => {
			store.endEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
		});
	});

	describe("isEditing", () => {
		it("should return correct state for registered editor", () => {
			store.startEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
		});

		it("should return false for unregistered editor", () => {
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
		});

		it("should distinguish between different content types", () => {
			store.startEdit("concept-plan-aims", 123);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.isEditing("concept-plan-outcome", 123)).toBe(false);
		});

		it("should distinguish between different entity IDs", () => {
			store.startEdit("concept-plan-aims", 123);

			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.isEditing("concept-plan-aims", 456)).toBe(false);
		});
	});

	describe("hasActiveEdits", () => {
		it("should return false when no editors are active", () => {
			expect(store.hasActiveEdits).toBe(false);
		});

		it("should return true when at least one editor is active", () => {
			store.startEdit("concept-plan-aims", 123);
			expect(store.hasActiveEdits).toBe(true);
		});

		it("should track multiple active editors", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-outcome", 456);

			expect(store.hasActiveEdits).toBe(true);
		});

		it("should return false after all editors are closed", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-outcome", 456);

			store.endEdit("concept-plan-aims", 123);
			store.endEdit("concept-plan-outcome", 456);

			expect(store.hasActiveEdits).toBe(false);
		});
	});

	describe("clearAll", () => {
		it("should remove all active edits", () => {
			store.startEdit("concept-plan-aims", 123);
			store.startEdit("concept-plan-outcome", 456);
			store.startEdit("concept-plan-collaborations", 789);

			store.clearAll();

			expect(store.hasActiveEdits).toBe(false);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
			expect(store.isEditing("concept-plan-outcome", 456)).toBe(false);
			expect(store.isEditing("concept-plan-collaborations", 789)).toBe(false);
		});

		it("should handle clearing when no edits are active", () => {
			store.clearAll();
			expect(store.hasActiveEdits).toBe(false);
		});
	});

	describe("Property: Edit mode state transitions", () => {
		it("should maintain consistent state through multiple transitions", () => {
			// Start editing
			store.startEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.hasActiveEdits).toBe(true);

			// End editing
			store.endEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
			expect(store.hasActiveEdits).toBe(false);

			// Start again
			store.startEdit("concept-plan-aims", 123);
			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
			expect(store.hasActiveEdits).toBe(true);
		});

		it("should handle complex multi-editor scenarios", () => {
			// Start multiple editors
			store.startEdit("concept-plan-aims", 1);
			store.startEdit("concept-plan-outcome", 2);
			store.startEdit("concept-plan-collaborations", 3);

			expect(store.hasActiveEdits).toBe(true);

			// End one editor
			store.endEdit("concept-plan-outcome", 2);
			expect(store.hasActiveEdits).toBe(true);
			expect(store.isEditing("concept-plan-aims", 1)).toBe(true);
			expect(store.isEditing("concept-plan-outcome", 2)).toBe(false);
			expect(store.isEditing("concept-plan-collaborations", 3)).toBe(true);

			// Clear all
			store.clearAll();
			expect(store.hasActiveEdits).toBe(false);
			expect(store.isEditing("concept-plan-aims", 1)).toBe(false);
			expect(store.isEditing("concept-plan-collaborations", 3)).toBe(false);
		});
	});

	describe("registerEditor", () => {
		it("should store original content when editor is registered", () => {
			const originalContent = "<p>Original content</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
		});

		it("should handle duplicate registration by updating existing entry", () => {
			const originalContent1 = "<p>First content</p>";
			const originalContent2 = "<p>Updated content</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: originalContent1,
				elementRef: null,
			});

			// Register again with different content
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: originalContent2,
				elementRef: null,
			});

			// Should still be editing (not duplicated)
			expect(store.isEditing("concept-plan-aims", 123)).toBe(true);
		});

		it("should validate parameters and handle invalid input", () => {
			// Should not throw, but should log error
			store.registerEditor({
				contentType: "" as unknown as ContentType,
				entityId: 0,
				originalContent: "",
				elementRef: null,
			});

			// Should not be registered
			expect(store.isEditing("" as unknown as ContentType, 0)).toBe(false);
		});
	});

	describe("updateCurrentContent", () => {
		it("should update current content immediately for change detection", () => {
			const originalContent = "<p>Original</p>";
			const newContent = "<p>Modified</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			store.updateCurrentContent("concept-plan-aims", 123, newContent);

			// Should have changes immediately (no debounce for change detection)
			expect(store.hasChanges("concept-plan-aims", 123)).toBe(true);
		});

		it("should debounce rapid updates", async () => {
			const originalContent = "<p>Original</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			// Rapid updates
			store.updateCurrentContent("concept-plan-aims", 123, "<p>Update 1</p>");
			store.updateCurrentContent("concept-plan-aims", 123, "<p>Update 2</p>");
			store.updateCurrentContent("concept-plan-aims", 123, "<p>Update 3</p>");

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			// Should have changes (last update should be applied)
			expect(store.hasChanges("concept-plan-aims", 123)).toBe(true);
		});
	});

	describe("unregisterEditor", () => {
		it("should remove editor state and clean up timers", async () => {
			const originalContent = "<p>Original</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			// Start an update (creates timer)
			store.updateCurrentContent("concept-plan-aims", 123, "<p>Modified</p>");

			// Unregister immediately
			store.unregisterEditor("concept-plan-aims", 123);

			// Should no longer be editing
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);

			// Wait to ensure timer was cleared (no error should occur)
			await new Promise((resolve) => setTimeout(resolve, 350));

			// Should still not be editing
			expect(store.isEditing("concept-plan-aims", 123)).toBe(false);
		});
	});

	describe("hasChanges", () => {
		it("should return false when content is unchanged", () => {
			const content = "<p>Same content</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: content,
				elementRef: null,
			});

			expect(store.hasChanges("concept-plan-aims", 123)).toBe(false);
		});

		it("should return true when content is modified", async () => {
			const originalContent = "<p>Original</p>";
			const newContent = "<p>Modified</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			store.updateCurrentContent("concept-plan-aims", 123, newContent);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.hasChanges("concept-plan-aims", 123)).toBe(true);
		});

		it("should ignore insignificant whitespace differences", async () => {
			const originalContent = "<p>Hello</p>  <p>World</p>";
			const newContent = "<p>Hello</p><p>World</p>";

			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent,
				elementRef: null,
			});

			store.updateCurrentContent("concept-plan-aims", 123, newContent);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			// Should not have changes (whitespace normalised)
			expect(store.hasChanges("concept-plan-aims", 123)).toBe(false);
		});

		it("should return false for unregistered editor", () => {
			expect(store.hasChanges("concept-plan-aims", 999)).toBe(false);
		});

		it("should use the change state reported by the editor", () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Same</p>",
				elementRef: null,
			});
			// A blank line is dropped by the content comparison...
			store.updateCurrentContent(
				"concept-plan-aims",
				123,
				"<p>Same</p><p><br></p>"
			);
			expect(store.hasChanges("concept-plan-aims", 123)).toBe(false);

			// ...but the editor knows it is a change
			store.reportHasChanges("concept-plan-aims", 123, true);
			expect(store.hasChanges("concept-plan-aims", 123)).toBe(true);
			expect(store.hasUnsavedChanges).toBe(true);
		});

		it("should trust a reported 'no changes' over differing serialisation", () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Stored by an older editor</p>",
				elementRef: null,
			});
			store.updateCurrentContent(
				"concept-plan-aims",
				123,
				'<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Stored by an older editor</span></p>'
			);

			store.reportHasChanges("concept-plan-aims", 123, false);

			expect(store.hasChanges("concept-plan-aims", 123)).toBe(false);
		});

		it("should ignore reports for an unregistered editor", () => {
			store.reportHasChanges("concept-plan-aims", 999, true);
			expect(store.hasChanges("concept-plan-aims", 999)).toBe(false);
		});
	});

	describe("hasUnsavedChanges", () => {
		it("should return false when no editors have changes", () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Content</p>",
				elementRef: null,
			});

			expect(store.hasUnsavedChanges).toBe(false);
		});

		it("should return true when at least one editor has changes", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Original</p>",
				elementRef: null,
			});

			store.updateCurrentContent("concept-plan-aims", 123, "<p>Modified</p>");

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.hasUnsavedChanges).toBe(true);
		});

		it("should track multiple editors with changes", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");
			store.updateCurrentContent(
				"concept-plan-outcome",
				2,
				"<p>Modified 2</p>"
			);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.hasUnsavedChanges).toBe(true);
		});
	});

	describe("editorsWithChanges", () => {
		it("should return empty array when no editors have changes", () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Content</p>",
				elementRef: null,
			});

			expect(store.editorsWithChanges).toEqual([]);
		});

		it("should return editors with changes in registration order", async () => {
			// Register editors with slight delay to ensure different timestamps
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			await new Promise((resolve) => setTimeout(resolve, 10));

			store.registerEditor({
				contentType: "concept-plan-collaborations",
				entityId: 3,
				originalContent: "<p>Original 3</p>",
				elementRef: null,
			});

			// Modify all editors
			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");
			store.updateCurrentContent(
				"concept-plan-outcome",
				2,
				"<p>Modified 2</p>"
			);
			store.updateCurrentContent(
				"concept-plan-collaborations",
				3,
				"<p>Modified 3</p>"
			);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			const editors = store.editorsWithChanges;

			expect(editors).toHaveLength(3);
			expect(editors[0].contentType).toBe("concept-plan-aims");
			expect(editors[1].contentType).toBe("concept-plan-outcome");
			expect(editors[2].contentType).toBe("concept-plan-collaborations");
		});

		it("should only include editors with actual changes", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			// Only modify first editor
			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			const editors = store.editorsWithChanges;

			expect(editors).toHaveLength(1);
			expect(editors[0].contentType).toBe("concept-plan-aims");
		});
	});

	describe("unsavedCount", () => {
		it("should return 0 when no editors have changes", () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 123,
				originalContent: "<p>Content</p>",
				elementRef: null,
			});

			expect(store.unsavedCount).toBe(0);
		});

		it("should return correct count of editors with changes", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-collaborations",
				entityId: 3,
				originalContent: "<p>Original 3</p>",
				elementRef: null,
			});

			// Modify two editors
			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");
			store.updateCurrentContent(
				"concept-plan-outcome",
				2,
				"<p>Modified 2</p>"
			);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.unsavedCount).toBe(2);
		});
	});

	describe("Property: Multiple editors maintain independent state", () => {
		it("should track changes independently for each editor", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			// Modify only first editor
			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.hasChanges("concept-plan-aims", 1)).toBe(true);
			expect(store.hasChanges("concept-plan-outcome", 2)).toBe(false);
			expect(store.unsavedCount).toBe(1);
		});

		it("should handle unregistering one editor without affecting others", async () => {
			store.registerEditor({
				contentType: "concept-plan-aims",
				entityId: 1,
				originalContent: "<p>Original 1</p>",
				elementRef: null,
			});

			store.registerEditor({
				contentType: "concept-plan-outcome",
				entityId: 2,
				originalContent: "<p>Original 2</p>",
				elementRef: null,
			});

			// Modify both
			store.updateCurrentContent("concept-plan-aims", 1, "<p>Modified 1</p>");
			store.updateCurrentContent(
				"concept-plan-outcome",
				2,
				"<p>Modified 2</p>"
			);

			// Wait for debounce
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(store.unsavedCount).toBe(2);

			// Unregister first editor
			store.unregisterEditor("concept-plan-aims", 1);

			expect(store.isEditing("concept-plan-aims", 1)).toBe(false);
			expect(store.isEditing("concept-plan-outcome", 2)).toBe(true);
			expect(store.unsavedCount).toBe(1);
		});
	});
});
