import {
	forwardRef,
	useEffect,
	useId,
	useImperativeHandle,
	useRef,
	useState,
	type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import type { BaseComboboxProps, BaseComboboxRef } from "./types";

/**
 * BaseCombobox - Generic combobox component with full keyboard navigation
 *
 * Extracted from BaseUserSearch to provide reusable pattern for any searchable dropdown.
 * Preserves exact functionality and appearance of UserSearchDropdown.
 *
 * Features:
 * - Debounced search (configurable, default 300ms)
 * - Portal-based dropdown positioning
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Mouse integration (hover updates keyboard position)
 * - Click-away detection
 * - Optional "add new" functionality
 * - Single-select mode
 * - Optional ARIA combobox and listbox markup (`listbox` prop)
 *
 * @template T - The type of items in the combobox
 *
 * @example
 * ```tsx
 * <BaseCombobox<IUserData>
 *   searchFn={searchUsers}
 *   value={selectedUser}
 *   onChange={setSelectedUser}
 *   getItemKey={(user) => user.id}
 *   renderSelected={(user, onClear) => <SelectedDisplay user={user} onClear={onClear} />}
 *   renderMenuItem={(user, onSelect, isHighlighted) => (
 *     <MenuItem user={user} onClick={() => onSelect(user)} highlighted={isHighlighted} />
 *   )}
 * />
 * ```
 */
export const BaseCombobox = forwardRef(
	<T,>(props: BaseComboboxProps<T>, ref: React.Ref<BaseComboboxRef>) => {
		const {
			searchFn,
			value,
			onChange,
			getItemKey,
			renderSelected,
			renderMenuItem,
			onCreateNew,
			createNewLabel,
			onCreateNewClick,
			createNewClickLabel,
			label,
			placeholder = "Search...",
			helperText,
			showIcon = false,
			icon,
			autoFocus,
			isRequired,
			isEditable = true,
			disabled,
			className,
			wrapperClassName,
			debounceMs = 300,
			maxResults = 10,
			minSearchLength = 0,
			ariaLabel,
			listbox = false,
		} = props;

		const inputRef = useRef<HTMLInputElement>(null);
		const wrapperRef = useRef<HTMLDivElement>(null);
		const [searchTerm, setSearchTerm] = useState("");
		const [isMenuOpen, setIsMenuOpen] = useState(false);
		const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
		const [filteredItems, setFilteredItems] = useState<T[]>([]);
		const [isCreating, setIsCreating] = useState(false);

		// Generate unique IDs for accessibility
		const uniqueId = useId();
		const inputId = `combobox-input-${uniqueId}`;
		const helperTextId = `combobox-helper-${uniqueId}`;
		const listboxId = `combobox-listbox-${uniqueId}`;

		// Debounce search term
		const debouncedSearchTerm = useDebouncedValue(searchTerm, debounceMs);

		// Fetch items based on debounced search term
		// Fetch items based on debounced search term
		useEffect(() => {
			if (debouncedSearchTerm.trim().length >= minSearchLength) {
				searchFn(debouncedSearchTerm)
					.then((items) => {
						setFilteredItems(items.slice(0, maxResults));
					})
					.catch((error) => {
						console.error("Error fetching items:", error);
						setFilteredItems([]);
					});
			} else {
				// eslint-disable-next-line react-hooks/set-state-in-effect -- clear results when below min length
				setFilteredItems([]);
			}
		}, [debouncedSearchTerm, searchFn, maxResults, minSearchLength]);

		// Click-away detection
		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				const target = event.target as Node;
				// Check if click is inside the wrapper
				if (wrapperRef.current?.contains(target)) return;
				// Check if click is inside the portal dropdown
				const portal = (target as Element).closest?.("[data-combobox-portal]");
				if (portal) return;

				setIsMenuOpen(false);
				setHighlightedIndex(-1);
			};

			if (isMenuOpen) {
				document.addEventListener("mousedown", handleClickOutside);
				return () =>
					document.removeEventListener("mousedown", handleClickOutside);
			}
		}, [isMenuOpen]);

		const handleSelectItem = (item: T) => {
			setIsMenuOpen(false);
			setHighlightedIndex(-1);
			setSearchTerm("");
			onChange(item);
		};

		const handleClearSelection = () => {
			if (!isEditable) {
				return;
			}
			setIsMenuOpen(false); // Close menu when clearing
			onChange(null);
		};

		const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
			const { key } = event;
			const resultsCount = filteredItems.length + (showCreateOption ? 1 : 0);

			if (resultsCount === 0) return;

			switch (key) {
				case "ArrowDown":
					event.preventDefault();
					setHighlightedIndex((prev) =>
						prev < resultsCount - 1 ? prev + 1 : prev
					);
					break;

				case "ArrowUp":
					event.preventDefault();
					setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
					break;

				case "Enter":
					event.preventDefault();
					if (
						highlightedIndex >= 0 &&
						highlightedIndex < filteredItems.length
					) {
						handleSelectItem(filteredItems[highlightedIndex]);
					} else if (
						highlightedIndex === filteredItems.length &&
						showCreateOption
					) {
						handleCreateNew();
					}
					break;

				case "Escape":
					event.preventDefault();
					setIsMenuOpen(false);
					setHighlightedIndex(-1);
					break;
			}
		};

		const handleCreateNew = async () => {
			if (!onCreateNew || !searchTerm.trim() || isCreating) return;

			setIsCreating(true);
			try {
				const newItem = await onCreateNew(searchTerm.trim());
				handleSelectItem(newItem);
			} catch (error) {
				console.error("Error creating item:", error);
			} finally {
				setIsCreating(false);
			}
		};

		useImperativeHandle(ref, () => ({
			focusInput: () => {
				if (inputRef.current) {
					inputRef.current.focus();
				}
			},
			clearSelection: handleClearSelection,
		}));

		const showCreateOption =
			!!onCreateNew &&
			!!createNewLabel &&
			searchTerm.trim() !== "" &&
			filteredItems.length === 0 &&
			!isCreating;

		// Fire-and-forget "create new" click (for modal-based creation)
		const showCreateClickOption =
			!showCreateOption &&
			!!onCreateNewClick &&
			!!createNewClickLabel &&
			searchTerm.trim() !== "" &&
			filteredItems.length === 0;

		const isResultsOpen =
			(filteredItems.length > 0 || showCreateOption || showCreateClickOption) &&
			isMenuOpen;
		const optionCount =
			filteredItems.length +
			(showCreateOption || showCreateClickOption ? 1 : 0);
		const activeOptionId =
			listbox &&
			isResultsOpen &&
			highlightedIndex >= 0 &&
			highlightedIndex < optionCount
				? getOptionId(listboxId, highlightedIndex)
				: undefined;

		return (
			<div
				ref={wrapperRef}
				className={cn("w-full", isRequired && "required", wrapperClassName)}
			>
				{label && (
					<Label htmlFor={inputId} className="mb-2">
						{label}
					</Label>
				)}
				{value && renderSelected ? (
					renderSelected(value, handleClearSelection)
				) : (
					<div
						className="relative"
						onMouseDown={(e) => {
							// Only handle clicks on the wrapper itself, not on the input
							if (e.target !== e.currentTarget) return;

							// Prevent default to avoid cursor jumping to start first
							e.preventDefault();
							// When clicking the wrapper, focus input and move cursor to end
							if (inputRef.current) {
								inputRef.current.focus();
								// Move cursor to end of text
								const length = inputRef.current.value.length;
								inputRef.current.setSelectionRange(length, length);
							}
						}}
					>
						{/* Icon - only show when showIcon is true and no item is selected */}
						{showIcon && icon && (
							<div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
								{icon}
							</div>
						)}
						<Input
							ref={inputRef}
							id={inputId}
							type="text"
							value={searchTerm}
							onChange={(event) => {
								setSearchTerm(event.target.value);
								// Reset highlight when search term changes
								setHighlightedIndex(-1);
								// Reopen menu when user starts typing (only if currently closed)
								if (event.target.value.trim().length > 0 && !isMenuOpen) {
									setIsMenuOpen(true);
								}
							}}
							onKeyDown={handleKeyDown}
							placeholder={placeholder}
							className={cn(showIcon && icon && "pl-10", className)}
							onFocus={() => {
								// Only open menu on focus if there's search text
								if (searchTerm.trim().length > 0) {
									setIsMenuOpen(true);
								}
							}}
							autoFocus={autoFocus}
							autoComplete="off"
							disabled={disabled}
							aria-required={isRequired}
							aria-describedby={helperText ? helperTextId : undefined}
							aria-label={!label ? ariaLabel : undefined}
							{...(listbox && {
								role: "combobox",
								"aria-autocomplete": "list" as const,
								"aria-expanded": isResultsOpen,
								"aria-controls": listboxId,
								"aria-activedescendant": activeOptionId,
							})}
						/>
					</div>
				)}
				{!value && (
					<div className="relative w-full">
						<SearchResultsPortal
							isOpen={isResultsOpen}
							listbox={
								listbox
									? {
											id: listboxId,
											label: label || ariaLabel || "Search results",
										}
									: undefined
							}
							inputRef={inputRef}
							items={filteredItems}
							onSelect={handleSelectItem}
							renderMenuItem={renderMenuItem}
							highlightedIndex={highlightedIndex}
							onHighlightChange={setHighlightedIndex}
							getItemKey={getItemKey}
							showCreateOption={showCreateOption}
							createNewLabel={createNewLabel ? createNewLabel(searchTerm) : ""}
							onCreateNew={handleCreateNew}
							isCreating={isCreating}
							showCreateClickOption={showCreateClickOption}
							createNewClickLabel={createNewClickLabel}
							onCreateNewClick={onCreateNewClick}
						/>
					</div>
				)}
				{helperText && (
					<p
						id={helperTextId}
						className={cn("text-sm text-muted-foreground mt-2")}
					>
						{helperText}
					</p>
				)}
			</div>
		);
	}
) as <T>(
	props: BaseComboboxProps<T> & { ref?: React.Ref<BaseComboboxRef> }
) => React.ReactElement;

// =========================================== INTERNAL COMPONENTS ====================================================

/** Id of the option at an index in a combobox's listbox */
const getOptionId = (listboxId: string, index: number) =>
	`${listboxId}-option-${index}`;

/**
 * Props for an entry in the results. In listbox mode the entry is an option
 * that selects on click; mousedown is cancelled so focus stays in the input.
 */
const getEntryProps = (
	listbox: { id: string } | undefined,
	index: number,
	isHighlighted: boolean,
	onActivate: () => void
) =>
	listbox
		? {
				id: getOptionId(listbox.id, index),
				role: "option" as const,
				"aria-selected": isHighlighted,
				onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
				onClick: onActivate,
			}
		: {};

interface SearchResultsPortalProps<T> {
	isOpen: boolean;
	/** Listbox id and accessible name, when the results form a listbox */
	listbox?: { id: string; label: string };
	inputRef: RefObject<HTMLInputElement | null>;
	items: T[];
	onSelect: (item: T) => void;
	renderMenuItem: (
		item: T,
		onSelect: (item: T) => void,
		isHighlighted: boolean
	) => React.ReactNode;
	highlightedIndex: number;
	onHighlightChange: (index: number) => void;
	getItemKey: (item: T) => string | number;
	showCreateOption: boolean;
	createNewLabel: string;
	onCreateNew: () => void;
	isCreating: boolean;
	// Fire-and-forget create (for modal-based creation)
	showCreateClickOption?: boolean;
	createNewClickLabel?: string;
	onCreateNewClick?: () => void;
}

const SearchResultsPortal = <T,>({
	isOpen,
	listbox,
	inputRef,
	items,
	onSelect,
	renderMenuItem,
	highlightedIndex,
	onHighlightChange,
	getItemKey,
	showCreateOption,
	createNewLabel,
	onCreateNew,
	isCreating,
	showCreateClickOption,
	createNewClickLabel,
	onCreateNewClick,
}: SearchResultsPortalProps<T>) => {
	const portalElement = useState<HTMLElement>(() => {
		const el = document.createElement("div");
		el.style.position = "fixed";
		el.style.zIndex = "55";
		return el;
	})[0];
	const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
	const itemRefs = useRef<Map<number, HTMLElement>>(new Map());

	// Append/remove portal element
	useEffect(() => {
		if (portalElement) {
			document.body.appendChild(portalElement);
			return () => {
				if (document.body.contains(portalElement)) {
					document.body.removeChild(portalElement);
				}
			};
		}
	}, [portalElement]);

	// Update position when inputRef changes or when isOpen changes
	useEffect(() => {
		if (inputRef.current && isOpen) {
			const updatePosition = () => {
				if (!inputRef.current) return;
				const rect = inputRef.current.getBoundingClientRect();
				setPosition({
					top: rect.bottom + window.scrollY,
					left: rect.left + window.scrollX,
					width: rect.width,
				});
			};

			updatePosition();

			window.addEventListener("scroll", updatePosition, true); // Use capture phase
			window.addEventListener("resize", updatePosition);

			return () => {
				window.removeEventListener("scroll", updatePosition, true);
				window.removeEventListener("resize", updatePosition);
			};
		}
	}, [inputRef, isOpen]);

	// Scroll highlighted item into view when highlightedIndex changes
	useEffect(() => {
		if (highlightedIndex >= 0 && isOpen && inputRef.current) {
			const highlightedElement = itemRefs.current.get(highlightedIndex);
			if (highlightedElement) {
				// Get the portal's position
				const portalRect = highlightedElement.getBoundingClientRect();

				// Check if the highlighted item in the portal is visible in viewport
				const isInView =
					portalRect.top >= 0 &&
					portalRect.bottom <=
						(window.innerHeight || document.documentElement.clientHeight);

				// If not in view, scroll to the input element (which the portal follows)
				if (!isInView) {
					inputRef.current.scrollIntoView({
						behavior: "smooth",
						block: "nearest",
					});
				}
			}
		}
	}, [highlightedIndex, isOpen, inputRef]);

	if (!isOpen || !portalElement) return null;

	return createPortal(
		<div
			data-combobox-portal
			className={cn(
				"fixed min-w-[200px] shadow-md z-[9999] rounded-md bg-white dark:bg-gray-700"
			)}
			style={{
				top: `${position.top}px`,
				left: `${position.left}px`,
				width: `${position.width}px`,
			}}
		>
			<div
				className="relative w-full"
				{...(listbox && {
					id: listbox.id,
					role: "listbox",
					"aria-label": listbox.label,
				})}
			>
				{items.map((item, index) => (
					<div
						key={getItemKey(item)}
						ref={(el) => {
							if (el) {
								itemRefs.current.set(index, el);
							} else {
								itemRefs.current.delete(index);
							}
						}}
						onMouseEnter={() => onHighlightChange(index)}
						{...getEntryProps(listbox, index, index === highlightedIndex, () =>
							onSelect(item)
						)}
					>
						{renderMenuItem(item, onSelect, index === highlightedIndex)}
					</div>
				))}

				{/* Create options as listbox entries */}
				{listbox && (showCreateOption || showCreateClickOption) && (
					<div
						ref={(el) => {
							if (el) {
								itemRefs.current.set(items.length, el);
							} else {
								itemRefs.current.delete(items.length);
							}
						}}
						onMouseEnter={() => onHighlightChange(items.length)}
						className={cn(
							"w-full text-left px-3 py-2 transition-colors border-t border-gray-200 dark:border-gray-600 cursor-pointer",
							highlightedIndex === items.length &&
								"bg-gray-200 dark:bg-gray-600"
						)}
						{...getEntryProps(
							listbox,
							items.length,
							highlightedIndex === items.length,
							() => {
								if (showCreateOption) {
									if (!isCreating) onCreateNew();
								} else {
									onCreateNewClick?.();
								}
							}
						)}
						aria-disabled={showCreateOption && isCreating ? true : undefined}
					>
						<span className="text-green-600 dark:text-green-400 flex items-center gap-2 text-sm">
							{showCreateOption
								? isCreating
									? "Creating..."
									: createNewLabel
								: createNewClickLabel}
						</span>
					</div>
				)}

				{/* Create new option */}
				{!listbox && showCreateOption && (
					<button
						type="button"
						onClick={onCreateNew}
						disabled={isCreating}
						ref={(el) => {
							if (el) {
								itemRefs.current.set(items.length, el);
							} else {
								itemRefs.current.delete(items.length);
							}
						}}
						onMouseEnter={() => onHighlightChange(items.length)}
						className={cn(
							"w-full text-left px-3 py-2 transition-colors border-t border-gray-200 dark:border-gray-600 cursor-pointer",
							highlightedIndex === items.length &&
								"bg-gray-200 dark:bg-gray-600"
						)}
					>
						<span className="text-green-600 dark:text-green-400 flex items-center gap-2 text-sm">
							{isCreating ? "Creating..." : createNewLabel}
						</span>
					</button>
				)}

				{/* Fire-and-forget create option (for modal-based creation) */}
				{!listbox && showCreateClickOption && onCreateNewClick && (
					<button
						type="button"
						onClick={onCreateNewClick}
						onMouseEnter={() => onHighlightChange(items.length)}
						className={cn(
							"w-full text-left px-3 py-2 transition-colors border-t border-gray-200 dark:border-gray-600 cursor-pointer",
							highlightedIndex === items.length &&
								"bg-gray-200 dark:bg-gray-600"
						)}
					>
						<span className="text-green-600 dark:text-green-400 flex items-center gap-2 text-sm">
							{createNewClickLabel}
						</span>
					</button>
				)}
			</div>
		</div>,
		portalElement
	);
};
