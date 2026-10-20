import { memo, useMemo } from "react";
import { Button } from "@/shared/components/ui/button";
import { useWindowSize } from "@/shared/hooks/useWindowSize";
import { BREAKPOINTS } from "@/shared/constants/breakpoints";
import { scrollMainContentToTop } from "@/shared/utils/scroll.utils";

interface PaginationProps {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
	startIndex: number;
	endIndex: number;
	totalItems: number;
	className?: string;
	itemLabel?: string;
}

/**
 * Pagination component
 * Provides navigation controls for paginated data with responsive page number display,
 * range information, and full accessibility support
 */
export const Pagination = memo<PaginationProps>(
	({
		currentPage,
		totalPages,
		onPageChange,
		startIndex,
		endIndex,
		totalItems,
		className = "",
		itemLabel = "items",
	}: PaginationProps) => {
		const { width } = useWindowSize();

		// Responsive max displayed pages using breakpoint constants
		// Mobile: 3 pages, Tablet: 5 pages, Desktop: 8 pages
		const maxDisplayedPages =
			width < BREAKPOINTS.sm ? 3 : width < BREAKPOINTS.lg ? 5 : 8;

		// Memoize visible page numbers calculation
		const visiblePages = useMemo(() => {
			let startPage = Math.max(
				1,
				currentPage - Math.floor(maxDisplayedPages / 2)
			);
			const endPage = Math.min(totalPages, startPage + maxDisplayedPages - 1);
			if (endPage - startPage < maxDisplayedPages - 1) {
				startPage = Math.max(1, endPage - maxDisplayedPages + 1);
			}
			return Array.from(
				{ length: endPage - startPage + 1 },
				(_, i) => startPage + i
			);
		}, [currentPage, totalPages, maxDisplayedPages]);

		if (totalPages <= 1) {
			return null;
		}

		const handleClick = (pageNumber: number) => {
			onPageChange(pageNumber);
			scrollMainContentToTop("smooth");
		};

		return (
			<div
				className={`flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 ${className}`}
			>
				{/* Range information */}
				<p className="text-sm text-muted-foreground">
					Showing {startIndex + 1}-{endIndex} of {totalItems} {itemLabel}
				</p>

				{/* Pagination controls */}
				<nav
					aria-label="Pagination navigation"
					className="flex items-center gap-2"
				>
					{/* Previous button */}
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage === 1}
						onClick={() => handleClick(currentPage - 1)}
						aria-label="Go to previous page"
						aria-disabled={currentPage === 1}
						className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
					>
						Previous
					</Button>

					{/* Page number buttons */}
					{visiblePages.map((pageNum) => {
						const isActive = pageNum === currentPage;
						return (
							<Button
								key={pageNum}
								size="sm"
								variant="outline"
								onClick={() => handleClick(pageNum)}
								aria-label={`Go to page ${pageNum}`}
								aria-current={isActive ? "page" : undefined}
								className={`min-w-[2.5rem] ${
									isActive
										? "bg-blue-500 text-white hover:bg-blue-600 hover:text-white border-blue-500"
										: ""
								}`}
							>
								{pageNum}
							</Button>
						);
					})}

					{/* Next button */}
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage === totalPages}
						onClick={() => handleClick(currentPage + 1)}
						aria-label="Go to next page"
						aria-disabled={currentPage === totalPages}
						className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
					>
						Next
					</Button>
				</nav>

				{/* Screen reader announcement for page changes */}
				<div
					role="status"
					aria-live="polite"
					aria-atomic="true"
					className="sr-only"
				>
					Page {currentPage} of {totalPages}
				</div>
			</div>
		);
	}
);
