/**
 * InlineSaveEditor save-state tests
 *
 * Drives the real editor through its toolbar (jsdom cannot simulate typing into
 * Lexical) and checks when the Save button becomes available.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineSaveEditor } from "./InlineSaveEditor";

const mocks = vi.hoisted(() => ({
	mutate: vi.fn(),
	reportHasChanges: vi.fn(),
}));

vi.mock("@/shared/hooks/queries/useUpdateContent", () => ({
	useUpdateContent: () => ({
		mutate: mocks.mutate,
		isPending: false,
	}),
}));

vi.mock("@/app/stores/InlineEditStore", () => ({
	inlineEditStore: {
		isEditing: vi.fn(() => true),
		startEdit: vi.fn(),
		endEdit: vi.fn(),
		registerEditor: vi.fn(),
		unregisterEditor: vi.fn(),
		updateCurrentContent: vi.fn(),
		reportHasChanges: mocks.reportHasChanges,
	},
}));

const renderEditor = (
	props: Partial<React.ComponentProps<typeof InlineSaveEditor>> = {}
) => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<InlineSaveEditor
				contentType="project-plan-aims"
				entityId={1}
				initialContent="<p>First paragraph</p><p>Last paragraph</p>"
				canEdit
				label="Aims"
				{...props}
			/>
		</QueryClientProvider>
	);
};

const saveButton = () => screen.getByRole("button", { name: "Save Aims" });

/** Wait until the editor has loaded and placed the caret at the end */
const waitForEditorReady = async () => {
	await screen.findByRole("textbox", { name: "Edit Aims" });
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 300));
	});
};

describe("InlineSaveEditor - save state", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps Save disabled when nothing has been edited", async () => {
		renderEditor();
		await waitForEditorReady();

		expect(saveButton()).toBeDisabled();
	});

	it("enables Save after converting a paragraph to a bullet list", async () => {
		const user = userEvent.setup();
		renderEditor();
		await waitForEditorReady();

		await user.click(screen.getByRole("button", { name: "List" }));

		await waitFor(() => expect(saveButton()).toBeEnabled());
	});

	it("enables Save after an alignment-only change", async () => {
		const user = userEvent.setup();
		renderEditor();
		await waitForEditorReady();

		await user.click(screen.getByRole("button", { name: /align/i }));

		await waitFor(() => expect(saveButton()).toBeEnabled());
	});

	it("reports its change state for the unsaved-changes warning", async () => {
		const user = userEvent.setup();
		renderEditor();
		await waitForEditorReady();
		expect(mocks.reportHasChanges).toHaveBeenLastCalledWith(
			"project-plan-aims",
			1,
			false
		);

		await user.click(screen.getByRole("button", { name: /align/i }));

		await waitFor(() =>
			expect(mocks.reportHasChanges).toHaveBeenLastCalledWith(
				"project-plan-aims",
				1,
				true
			)
		);
	});

	describe("word limits", () => {
		const overLimitContent = `<p>${Array.from(
			{ length: 160 },
			(_, index) => `word${index}`
		).join(" ")}</p>`;

		it("still allows saving when over a suggested limit", async () => {
			const user = userEvent.setup();
			renderEditor({
				initialContent: overLimitContent,
				wordLimit: 150,
				limitCanBePassed: true,
			});
			await waitForEditorReady();

			await user.click(screen.getByRole("button", { name: /align/i }));

			await waitFor(() => expect(saveButton()).toBeEnabled());
			expect(
				screen.getByText("Content is over the suggested limit of 150 words")
			).toBeInTheDocument();
			expect(screen.queryByText(/exceeds word limit/)).not.toBeInTheDocument();

			// Ctrl+S saves too
			screen.getByRole("textbox", { name: "Edit Aims" }).focus();
			await user.keyboard("{Control>}s{/Control}");
			expect(mocks.mutate).toHaveBeenCalledTimes(1);
		});

		it("blocks saving when over a hard limit", async () => {
			const user = userEvent.setup();
			renderEditor({
				initialContent: overLimitContent,
				wordLimit: 150,
				limitCanBePassed: false,
			});
			await waitForEditorReady();

			await user.click(screen.getByRole("button", { name: /align/i }));

			await waitFor(() =>
				expect(
					screen.getByText("Content exceeds word limit of 150 words")
				).toBeInTheDocument()
			);
			expect(saveButton()).toBeDisabled();

			// Ctrl+S must not get round the limit
			screen.getByRole("textbox", { name: "Edit Aims" }).focus();
			await user.keyboard("{Control>}s{/Control}");
			expect(mocks.mutate).not.toHaveBeenCalled();
		});
	});
});
