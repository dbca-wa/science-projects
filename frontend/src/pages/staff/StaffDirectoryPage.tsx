import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useStaffProfiles } from "@/features/staff-profiles/hooks/useStaffProfiles";
import { useCurrentUser } from "@/features/auth";
import { useDocumentTitle } from "@/shared/hooks/useDocumentTitle";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import StaffProfileCard from "@/features/staff-profiles/components/directory/StaffProfileCard";
import { scrollMainContentToTop } from "@/shared/utils/scroll.utils";

const PAGE_SIZE = 24;

const StaffDirectoryPage = () => {
	useDocumentTitle("Staff Directory");

	// Inject CollectionPage schema JSON-LD for search engine structured data
	useEffect(() => {
		const script = document.createElement("script");
		script.type = "application/ld+json";
		script.textContent = JSON.stringify({
			"@context": "https://schema.org",
			"@type": "CollectionPage",
			name: "BCS Staff Directory",
			description:
				"Staff directory for the Biodiversity and Conservation Science Division, Department of Biodiversity, Conservation and Attractions.",
			url: window.location.href,
			isPartOf: {
				"@type": "WebSite",
				name: "Science Project Management System",
			},
		});
		document.head.appendChild(script);
		return () => {
			document.head.removeChild(script);
		};
	}, []);
	const [searchParams, setSearchParams] = useSearchParams();
	const { data: user } = useCurrentUser();

	const searchTerm = searchParams.get("searchTerm") || "";
	const page = parseInt(searchParams.get("page") || "1", 10);
	const showHidden = searchParams.get("showHidden") === "true";

	const { data, isLoading } = useStaffProfiles({
		search: searchTerm,
		page,
		showHidden,
		pageSize: PAGE_SIZE,
	});

	const [localSearch, setLocalSearch] = useState(searchTerm);

	const handleSearch = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setSearchParams({
			searchTerm: localSearch,
			page: "1",
			...(showHidden && { showHidden: "true" }),
		});
	};

	const handlePageChange = (newPage: number) => {
		setSearchParams({
			searchTerm,
			page: newPage.toString(),
			...(showHidden && { showHidden: "true" }),
		});
		scrollMainContentToTop("smooth");
	};

	const toggleHiddenProfiles = () => {
		setSearchParams({
			searchTerm,
			page: "1",
			showHidden: showHidden ? "false" : "true",
		});
	};

	const totalResults = data?.total_results ?? 0;
	const totalPages = data?.total_pages ?? 0;

	return (
		<div className="max-w-full overflow-x-hidden">
			{/* Skip to main content — WCAG 2.4.1 */}
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-[#2d2f32] focus:rounded focus:shadow-lg focus:text-sm focus:font-medium"
			>
				Skip to main content
			</a>

			{/* Hero banner */}
			<div className="bg-[#2d2f32] py-8 px-4 text-white text-center">
				<h1 className="text-2xl font-bold tracking-tight mb-1">
					BCS Staff Directory
				</h1>
				<p className="text-sm text-slate-300 mb-5">
					Biodiversity and Conservation Science Division
				</p>

				{/* Search bar */}
				<form
					className="flex w-full max-w-md mx-auto items-center gap-2"
					onSubmit={handleSearch}
					role="search"
					aria-label="Search staff profiles"
				>
					<Input
						className="bg-white/10 border-white/30 text-white placeholder:text-slate-300 focus:bg-white/20 focus:border-white"
						type="text"
						placeholder="Search by name..."
						value={localSearch}
						onChange={(e) => setLocalSearch(e.target.value)}
					/>
					<Button
						type="submit"
						className="bg-white text-[#2d2f32] hover:bg-slate-100 shrink-0"
						aria-label="Search staff profiles"
					>
						<Search className="size-4" aria-hidden="true" />
					</Button>
				</form>

				{/* Admin toggle */}
				{user?.is_superuser && (
					<div className="mt-4">
						<Button
							onClick={toggleHiddenProfiles}
							variant="outline"
							size="sm"
							aria-pressed={showHidden}
							className={`border-white/40 text-white bg-transparent hover:bg-white/10 hover:text-white ${
								showHidden
									? "border-red-400 text-red-300 hover:border-red-300"
									: ""
							}`}
						>
							{showHidden ? "Hide Hidden Profiles" : "Show Hidden Profiles"}
						</Button>
					</div>
				)}
			</div>

			{/* Results area */}
			<main
				id="main-content"
				className="px-4 sm:px-6 lg:px-10 xl:px-16 py-6"
				aria-label="Staff directory results"
			>
				{isLoading || !data ? (
					<div
						className="my-4 w-full"
						aria-busy="true"
						aria-label="Loading staff profiles"
					>
						<Skeleton className="h-5 w-48 mb-4 bg-gray-200" />
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
							{Array.from({ length: PAGE_SIZE }).map((_, i) => (
								<Skeleton key={i} className="h-48 bg-gray-200 rounded-xl" />
							))}
						</div>
					</div>
				) : (
					<div
						className={`w-full ${totalResults === 0 ? "flex items-center justify-center py-20" : ""}`}
					>
						{/* Live region announces result changes to screen readers */}
						<p
							className="text-sm text-slate-400 mb-4"
							aria-live="polite"
							aria-atomic="true"
						>
							{totalResults === 0
								? searchTerm
									? `No results for '${searchTerm}'`
									: data.it_assets_available === false
										? "The staff directory service is temporarily unavailable. Please try again later."
										: "No staff profiles found."
								: totalResults === 1
									? `Showing 1 result${searchTerm ? ` for '${searchTerm}'` : ""}`
									: `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalResults)} of ${totalResults} results${searchTerm ? ` for '${searchTerm}'` : ""}`}
							{data.showing_hidden && (
								<span className="ml-2 font-medium text-red-500">
									(including hidden profiles)
								</span>
							)}
						</p>

						{/* Grid */}
						<ul
							className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4 list-none p-0"
							aria-label="Staff profiles"
						>
							{data.users.map((profile) => (
								<li key={profile.id} className="h-full">
									<StaffProfileCard profile={profile} />
								</li>
							))}
						</ul>

						{/* Pagination */}
						{totalPages > 1 && totalResults > 0 && (
							<DirectoryPagination
								currentPage={page}
								totalPages={totalPages}
								onPageChange={handlePageChange}
							/>
						)}
					</div>
				)}
			</main>
		</div>
	);
};

/** Inline pagination matching the original */
const DirectoryPagination = ({
	currentPage,
	totalPages,
	onPageChange,
}: {
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) => {
	const pageNumbers: number[] = [];
	let startPage = Math.max(currentPage - 2, 1);
	const endPage = Math.min(startPage + 4, totalPages);
	if (endPage - startPage < 4) {
		startPage = Math.max(endPage - 4, 1);
	}
	for (let i = startPage; i <= endPage; i++) {
		pageNumbers.push(i);
	}

	return (
		<nav
			className="mt-8 flex items-center justify-center space-x-2"
			aria-label="Pagination"
		>
			<Button
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage === 1}
				aria-label="Go to previous page"
				aria-disabled={currentPage === 1}
				className="bg-gray-300 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
			>
				<ChevronLeft className="size-4 sm:hidden" aria-hidden="true" />
				<span className="hidden sm:inline">Previous</span>
			</Button>
			{pageNumbers.map((pageNumber) => (
				<Button
					key={pageNumber}
					onClick={() => onPageChange(pageNumber)}
					aria-label={`Page ${pageNumber}`}
					aria-current={pageNumber === currentPage ? "page" : undefined}
					className={
						pageNumber === currentPage
							? "bg-blue-500 text-white hover:bg-blue-400"
							: "bg-gray-300 text-gray-700 hover:bg-gray-200"
					}
				>
					{pageNumber}
				</Button>
			))}
			<Button
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage === totalPages}
				aria-label="Go to next page"
				aria-disabled={currentPage === totalPages}
				className="bg-gray-300 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
			>
				<ChevronRight className="size-4 sm:hidden" aria-hidden="true" />
				<span className="hidden sm:inline">Next</span>
			</Button>
		</nav>
	);
};

export default StaffDirectoryPage;
