import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { ProjectCombobox } from "./ProjectCombobox";
import { searchProjects } from "@/shared/services/project-search.service";
import type { BaseComboboxRef } from "@/shared/components/combobox";
import type { IProjectSearchResult } from "@/shared/types/project.types";

expect.extend(toHaveNoViolations);

vi.mock("@/shared/services/project-search.service", () => ({
	searchProjects: vi.fn(),
}));

const project = (
	id: number,
	number: number,
	title = `Project ${number}`
): IProjectSearchResult => ({
	id,
	title,
	kind: "science",
	status: "active",
	year: 2024,
	number,
});

const renderCombobox = (
	props: Partial<React.ComponentProps<typeof ProjectCombobox>> = {}
) => {
	const onSelect = vi.fn();
	const ref = createRef<BaseComboboxRef>();
	render(
		<ProjectCombobox
			ref={ref}
			label="Add a related project"
			onSelect={onSelect}
			{...props}
		/>
	);
	const input = screen.getByRole("combobox", { name: "Add a related project" });
	return { onSelect, ref, input };
};

describe("ProjectCombobox", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(searchProjects).mockResolvedValue([]);
	});

	it("never offers excluded projects", async () => {
		const user = userEvent.setup();
		vi.mocked(searchProjects).mockResolvedValue([
			project(1, 1),
			project(2, 2),
			project(3, 3),
		]);
		const { input } = renderCombobox({ excludeProjectIds: [1, 2] });

		await user.type(input, "project");

		const options = await screen.findAllByRole("option");
		expect(options).toHaveLength(1);
		expect(options[0]).toHaveTextContent("SP-2024-3");
		expect(searchProjects).toHaveBeenCalledWith("project");
	});

	it("shows at most ten results after removing excluded projects", async () => {
		const user = userEvent.setup();
		vi.mocked(searchProjects).mockResolvedValue(
			Array.from({ length: 13 }, (_, index) => project(index + 1, index + 1))
		);
		const { input } = renderCombobox({ excludeProjectIds: [1, 2] });

		await user.type(input, "project");

		const options = await screen.findAllByRole("option");
		expect(options).toHaveLength(10);
		expect(options[0]).toHaveTextContent("SP-2024-3");
	});

	it("waits for two characters before searching", async () => {
		const user = userEvent.setup();
		const { input } = renderCombobox();

		await user.type(input, "p");
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(searchProjects).not.toHaveBeenCalled();

		await user.type(input, "r");
		await waitFor(() => expect(searchProjects).toHaveBeenCalledWith("pr"));
	});

	it("shows the tag, plain-text title and status of each result", async () => {
		const user = userEvent.setup();
		vi.mocked(searchProjects).mockResolvedValue([
			project(3, 7, "<p>Fish &amp; fauna <strong>survey</strong></p>"),
		]);
		const { input } = renderCombobox();

		await user.type(input, "fish");

		const option = await screen.findByRole("option");
		expect(option).toHaveTextContent("SP-2024-7");
		expect(option).toHaveTextContent("Fish & fauna survey");
		expect(option).toHaveTextContent("Active (Approved)");
		expect(option.querySelector("strong")).toBeNull();
	});

	it("passes the clicked project to onSelect, clears the search and keeps focus", async () => {
		const user = userEvent.setup();
		const wetland = project(3, 7, "Wetland monitoring");
		vi.mocked(searchProjects).mockResolvedValue([wetland]);
		const { input, onSelect } = renderCombobox();

		await user.type(input, "wetland");
		await user.click(await screen.findByRole("option", { name: /SP-2024-7/ }));

		expect(onSelect).toHaveBeenCalledWith(wetland);
		expect(input).toHaveValue("");
		expect(input).toHaveFocus();
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("selects with the arrow keys and Enter, and closes with Escape", async () => {
		const user = userEvent.setup();
		vi.mocked(searchProjects).mockResolvedValue([project(3, 7), project(4, 8)]);
		const { input, onSelect } = renderCombobox();

		expect(input).toHaveAttribute("aria-expanded", "false");
		await user.type(input, "project");
		const listbox = await screen.findByRole("listbox", {
			name: "Add a related project",
		});
		expect(input).toHaveAttribute("aria-expanded", "true");
		expect(input).toHaveAttribute("aria-controls", listbox.id);
		expect(input).not.toHaveAttribute("aria-activedescendant");

		await user.keyboard("{ArrowDown}");
		const [first, second] = within(listbox).getAllByRole("option");
		expect(input).toHaveAttribute("aria-activedescendant", first.id);
		expect(first).toHaveAttribute("aria-selected", "true");
		expect(second).toHaveAttribute("aria-selected", "false");

		await user.keyboard("{Escape}");
		expect(input).toHaveAttribute("aria-expanded", "false");
		expect(input).not.toHaveAttribute("aria-activedescendant");
		expect(onSelect).not.toHaveBeenCalled();

		await user.type(input, "s");
		await screen.findByRole("listbox");
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(onSelect).toHaveBeenCalledWith(project(4, 8));
		expect(input).toHaveValue("");
	});

	it("can be focused through its ref", () => {
		const { input, ref } = renderCombobox();

		act(() => ref.current?.focusInput());

		expect(input).toHaveFocus();
	});

	it("has no accessibility violations with results open", async () => {
		const user = userEvent.setup();
		vi.mocked(searchProjects).mockResolvedValue([project(3, 7), project(4, 8)]);
		const { input } = renderCombobox({
			helperText: "Projects already in the list are not shown.",
		});
		// The page landmark rule does not apply to a component on its own
		const options = { rules: { region: { enabled: false } } };

		expect(await axe(document.body, options)).toHaveNoViolations();

		// The results are portalled to the body
		await user.type(input, "project");
		await screen.findByRole("listbox");
		await user.keyboard("{ArrowDown}");

		expect(await axe(document.body, options)).toHaveNoViolations();
	});
});
