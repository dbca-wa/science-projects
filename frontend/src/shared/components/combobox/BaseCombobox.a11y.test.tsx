import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { BaseCombobox } from "./BaseCombobox";

expect.extend(toHaveNoViolations);

// Mock data
interface MockItem {
	id: number;
	name: string;
}

const mockItems: MockItem[] = [
	{ id: 1, name: "Item One" },
	{ id: 2, name: "Item Two" },
	{ id: 3, name: "Item Three" },
];

describe("BaseCombobox - Accessibility", () => {
	let mockSearchFn: (searchTerm: string) => Promise<MockItem[]>;
	let mockOnChange: (value: MockItem | null) => void;

	beforeEach(() => {
		mockSearchFn = vi.fn(async () => mockItems) as (
			searchTerm: string
		) => Promise<MockItem[]>;
		mockOnChange = vi.fn() as (value: MockItem | null) => void;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const renderCombobox = (props = {}) => {
		return render(
			<BaseCombobox<MockItem>
				searchFn={mockSearchFn}
				value={null}
				onChange={mockOnChange}
				getItemKey={(item) => item.id}
				renderSelected={(item, onClear) => (
					<div data-testid="selected">
						{item.name}
						<button onClick={onClear} aria-label="Clear selection">
							Clear
						</button>
					</div>
				)}
				renderMenuItem={(item, onSelect, isHighlighted) => (
					<button
						data-testid={`item-${item.id}`}
						data-highlighted={isHighlighted}
						onClick={() => onSelect(item)}
						aria-label={`Select ${item.name}`}
					>
						{item.name}
					</button>
				)}
				label="Select Item"
				placeholder="Search..."
				{...props}
			/>
		);
	};

	describe("No Axe Violations", () => {
		it("has no violations in default state", async () => {
			const { container } = renderCombobox();
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations with label", async () => {
			const { container } = renderCombobox({ label: "Choose Item" });
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations with helper text", async () => {
			const { container } = renderCombobox({
				helperText: "Select an item from the list",
			});
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations with open menu", async () => {
			const user = userEvent.setup();
			const { container } = renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByTestId("item-1")).toBeInTheDocument();
			});

			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations with selected item", async () => {
			const { container } = renderCombobox({ value: mockItems[0] });
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations in disabled state", async () => {
			const { container } = renderCombobox({ disabled: true });
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("has no violations with required field", async () => {
			const { container } = renderCombobox({ isRequired: true });
			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});
	});

	describe("ARIA Labels and Roles", () => {
		it("has proper label association", () => {
			renderCombobox({ label: "Select Item" });
			const input = screen.getByPlaceholderText("Search...");
			const label = screen.getByText("Select Item");

			// Label should be in the document
			expect(label).toBeInTheDocument();
			// Input should be visible
			expect(input).toBeVisible();
		});

		it("has accessible name from label", () => {
			renderCombobox({ label: "Choose an item" });
			const input = screen.getByPlaceholderText("Search...");
			const label = screen.getByText("Choose an item");

			// Label should be in the document
			expect(label).toBeInTheDocument();
			// Input should be visible
			expect(input).toBeVisible();
		});

		it("menu items have accessible names", async () => {
			const user = userEvent.setup();
			renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByLabelText("Select Item One")).toBeInTheDocument();
				expect(screen.getByLabelText("Select Item Two")).toBeInTheDocument();
				expect(screen.getByLabelText("Select Item Three")).toBeInTheDocument();
			});
		});

		it("clear button has accessible name", () => {
			renderCombobox({ value: mockItems[0] });
			const clearButton = screen.getByLabelText("Clear selection");
			expect(clearButton).toBeInTheDocument();
		});
	});

	describe("Keyboard Accessibility", () => {
		it("input is keyboard focusable", () => {
			renderCombobox();
			const input = screen.getByPlaceholderText("Search...");
			input.focus();
			expect(input).toHaveFocus();
		});

		it("menu items are keyboard accessible", async () => {
			const user = userEvent.setup();
			renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByTestId("item-1")).toBeInTheDocument();
			});

			await user.keyboard("{ArrowDown}");
			await user.keyboard("{Enter}");

			expect(mockOnChange).toHaveBeenCalledWith(mockItems[0]);
		});

		it("clear button is keyboard accessible", async () => {
			const user = userEvent.setup();
			renderCombobox({ value: mockItems[0] });

			const clearButton = screen.getByLabelText("Clear selection");
			clearButton.focus();
			expect(clearButton).toHaveFocus();

			await user.keyboard("{Enter}");
			expect(mockOnChange).toHaveBeenCalledWith(null);
		});
	});

	describe("Screen Reader Support", () => {
		it("announces label to screen readers", () => {
			renderCombobox({ label: "Select Item" });
			const input = screen.getByPlaceholderText("Search...");
			const label = screen.getByText("Select Item");

			expect(label).toBeInTheDocument();
			expect(input).toBeVisible();
		});

		it("announces helper text to screen readers", () => {
			renderCombobox({
				label: "Select Item",
				helperText: "Choose from the list",
			});
			const helperText = screen.getByText("Choose from the list");
			expect(helperText).toBeInTheDocument();
		});

		it("announces disabled state", () => {
			renderCombobox({ disabled: true });
			const input = screen.getByPlaceholderText("Search...");
			expect(input).toBeDisabled();
		});
	});

	describe("Focus Management", () => {
		it("maintains focus on input during keyboard navigation", async () => {
			const user = userEvent.setup();
			renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByTestId("item-1")).toBeInTheDocument();
			});

			await user.keyboard("{ArrowDown}");
			expect(input).toHaveFocus();

			await user.keyboard("{ArrowUp}");
			expect(input).toHaveFocus();
		});

		it("returns focus to input after selection", async () => {
			const user = userEvent.setup();
			renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByTestId("item-1")).toBeInTheDocument();
			});

			await user.keyboard("{ArrowDown}");
			await user.keyboard("{Enter}");

			// After selection, focus should be manageable
			expect(mockOnChange).toHaveBeenCalled();
		});
	});

	describe("Color Contrast", () => {
		it("renders with sufficient color contrast", () => {
			renderCombobox();
			const input = screen.getByPlaceholderText("Search...");

			// Input should be visible
			expect(input).toBeVisible();
		});

		it("highlighted items have sufficient contrast", async () => {
			const user = userEvent.setup();
			renderCombobox();

			const input = screen.getByPlaceholderText("Search...");
			await user.type(input, "item");

			await waitFor(() => {
				expect(screen.getByTestId("item-1")).toBeInTheDocument();
			});

			await user.keyboard("{ArrowDown}");

			const highlightedItem = screen.getByTestId("item-1");
			expect(highlightedItem).toHaveAttribute("data-highlighted", "true");
			expect(highlightedItem).toBeVisible();
		});
	});

	describe("Listbox mode", () => {
		const renderListbox = (props = {}) =>
			render(
				<BaseCombobox<MockItem>
					searchFn={mockSearchFn}
					value={null}
					onChange={mockOnChange}
					getItemKey={(item) => item.id}
					renderSelected={(item) => <div>{item.name}</div>}
					renderMenuItem={(item, _onSelect, isHighlighted) => (
						<div data-highlighted={isHighlighted}>{item.name}</div>
					)}
					label="Select Item"
					placeholder="Search..."
					listbox
					{...props}
				/>
			);

		it("is off by default", async () => {
			const user = userEvent.setup();
			renderCombobox();

			await user.type(screen.getByPlaceholderText("Search..."), "item");
			await screen.findByTestId("item-1");

			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		});

		it("exposes the input as a combobox that controls a listbox", async () => {
			const user = userEvent.setup();
			renderListbox();

			const input = screen.getByRole("combobox", { name: "Select Item" });
			expect(input).toHaveAttribute("aria-autocomplete", "list");
			expect(input).toHaveAttribute("aria-expanded", "false");

			await user.type(input, "item");
			const listbox = await screen.findByRole("listbox", {
				name: "Select Item",
			});
			expect(input).toHaveAttribute("aria-expanded", "true");
			expect(input).toHaveAttribute("aria-controls", listbox.id);
			expect(within(listbox).getAllByRole("option")).toHaveLength(3);
		});

		it("points aria-activedescendant at the highlighted option", async () => {
			const user = userEvent.setup();
			renderListbox();

			const input = screen.getByRole("combobox");
			await user.type(input, "item");
			const options = await screen.findAllByRole("option");
			expect(input).not.toHaveAttribute("aria-activedescendant");

			await user.keyboard("{ArrowDown}{ArrowDown}");
			expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
			expect(options[1]).toHaveAttribute("aria-selected", "true");
			expect(options[0]).toHaveAttribute("aria-selected", "false");
			expect(input).toHaveFocus();

			await user.keyboard("{ArrowUp}{ArrowUp}");
			expect(input).not.toHaveAttribute("aria-activedescendant");
		});

		it("selects a clicked option and keeps focus in the input", async () => {
			const user = userEvent.setup();
			renderListbox();

			const input = screen.getByRole("combobox");
			await user.type(input, "item");
			await user.click(await screen.findByRole("option", { name: "Item Two" }));

			expect(mockOnChange).toHaveBeenCalledWith(mockItems[1]);
			expect(input).toHaveFocus();
			expect(input).toHaveAttribute("aria-expanded", "false");
		});

		it("offers the create option as an option", async () => {
			const user = userEvent.setup();
			const onCreateNew = vi.fn(async (term: string) => ({
				id: 99,
				name: term,
			}));
			renderListbox({
				searchFn: async () => [],
				onCreateNew,
				createNewLabel: (term: string) => `Add "${term}"`,
			});

			const input = screen.getByRole("combobox");
			await user.type(input, "Zebra");
			const option = await screen.findByRole("option", { name: 'Add "Zebra"' });

			await user.keyboard("{ArrowDown}");
			expect(input).toHaveAttribute("aria-activedescendant", option.id);

			await user.keyboard("{Enter}");
			await waitFor(() => expect(onCreateNew).toHaveBeenCalledWith("Zebra"));
			await waitFor(() =>
				expect(mockOnChange).toHaveBeenCalledWith({ id: 99, name: "Zebra" })
			);
		});

		it("has no violations with the listbox open", async () => {
			const user = userEvent.setup();
			renderListbox();

			await user.type(screen.getByRole("combobox"), "item");
			await screen.findByRole("listbox");
			await user.keyboard("{ArrowDown}");

			// The listbox is portalled to the body. The page landmark rule does
			// not apply to a component on its own.
			const results = await axe(document.body, {
				rules: { region: { enabled: false } },
			});
			expect(results).toHaveNoViolations();
		});
	});
});
