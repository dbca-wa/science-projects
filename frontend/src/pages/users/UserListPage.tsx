import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate, useParams } from "react-router";
import { observer } from "mobx-react-lite";
import { useDocumentTitle } from "@/shared/hooks/useDocumentTitle";
import { AutoBreadcrumb } from "@/shared/components/navigation/AutoBreadcrumb";
import {
	UserSearchBar,
	UserFilterPanel,
	UserGrid,
	Pagination,
	UserDetailSheet,
	useUserSearch,
} from "@/features/users";
import { EmptyState } from "@/shared/components/EmptyState";
import { NoResultsState } from "@/shared/components/NoResultsState";
import { ErrorState } from "@/shared/components/ErrorState";
import { NavigationButton } from "@/shared/components/navigation/NavigationButton";
import { SearchControls } from "@/shared/components/SearchControls";
import { useAuthStore, useUserSearchStore } from "@/app/stores/store-context";
import { useSearchStoreInit } from "@/shared/hooks/useSearchStoreInit";
import type { RoleFilter } from "@/app/stores/derived/user-search.store";
import { PageTransition } from "@/shared/components/PageTransition";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useBusinessAreas } from "@/shared/hooks/queries/useBusinessAreas";
import { ResponsiveLayout } from "@/shared/components/ResponsiveLayout";

/**
 * UserListPage
 * Main page for browsing and searching users with detail sheet
 */
const UserListPage = observer(() => {
	useDocumentTitle("Users");
	const navigate = useNavigate();
	const authStore = useAuthStore();
	const userSearchStore = useUserSearchStore();
	const [, setSearchParams] = useSearchParams();
	const params = useParams<{ id?: string }>();

	// Sheet state - controlled by URL
	const selectedUserId = params.id ? Number(params.id) : null;
	const isSheetOpen = !!selectedUserId;

	// Initialise from URL params and localStorage
	// TypeScript infers TFilters = UserSearchFilters from userSearchStore
	useSearchStoreInit({
		store: userSearchStore,
		storageKey: "userSearchState",
		urlParamMapping: {
			roleFilter: (v) => v as RoleFilter,
			businessArea: (v) => Number(v),
		},
	});

	// Fetch users with search and filters from store
	// Add enabled flag to prevent premature fetching during initialisation
	const { data, isLoading, error, refetch } = useUserSearch({
		searchTerm: userSearchStore.state.searchTerm,
		filters: userSearchStore.state.filters,
		page: userSearchStore.state.currentPage,
	});

	// Fetch business areas for desktop filter dropdown
	const { data: businessAreas, isLoading: isLoadingBusinessAreas } =
		useBusinessAreas();

	// Delay sheet opening until after page transition completes
	const [shouldShowSheet, setShouldShowSheet] = useState(false);
	const [shouldShowError, setShouldShowError] = useState(false);
	const wasLoadingRef = useRef(false);

	// Delay error display to avoid flash on initial load
	useEffect(() => {
		if (error && !isLoading) {
			// Only show error if it persists for 300ms
			const timer = setTimeout(() => {
				setShouldShowError(true);
			}, 300);
			return () => clearTimeout(timer);
		} else {
			setShouldShowError(false);
		}
	}, [error, isLoading]);

	useEffect(() => {
		// Only track loading if sheet should be open (direct link/refresh to /users/:id)
		if (isLoading && isSheetOpen) {
			wasLoadingRef.current = true;
		}
	}, [isLoading, isSheetOpen]);

	useEffect(() => {
		if (isSheetOpen && !isLoading) {
			// Only delay if we just finished loading WITH sheet open (refresh/direct link to /users/:id)
			// If wasLoadingRef is false, user clicked from list (no delay needed)
			const delay = wasLoadingRef.current ? 600 : 0;
			const timer = setTimeout(() => {
				setShouldShowSheet(true);
				wasLoadingRef.current = false; // Reset after first use
			}, delay);
			return () => clearTimeout(timer);
		} else if (!isSheetOpen) {
			setShouldShowSheet(false);
		}
	}, [isSheetOpen, isLoading]);

	// Update total results in store
	useEffect(() => {
		if (data?.total_results !== undefined) {
			userSearchStore.setTotalResults(data.total_results);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data?.total_results]);

	// Sync store state to URL params
	useEffect(() => {
		setSearchParams(userSearchStore.searchParams, { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		userSearchStore.state.searchTerm,
		userSearchStore.state.currentPage,
		userSearchStore.state.filters,
		setSearchParams,
	]);

	const handleCloseSheet = () => {
		navigate("/users");
	};

	const handleSearchChange = (value: string) => {
		userSearchStore.setSearchTerm(value);
	};

	const handleFiltersChange = (
		newFilters: typeof userSearchStore.state.filters
	) => {
		userSearchStore.setFilters(newFilters);
	};

	const handlePageChange = (newPage: number) => {
		userSearchStore.setCurrentPage(newPage);
	};

	const handleToggleSaveSearch = () => {
		userSearchStore.toggleSaveSearch();
	};

	const handleClearFilters = () => {
		userSearchStore.clearSearchAndFilters();
	};

	// Sort business areas by division for desktop dropdown
	const orderedDivisionSlugs = ["BCS", "CEM", "RFMS"];
	const sortedBusinessAreas = businessAreas?.slice().sort((a, b) => {
		const aDivSlug =
			typeof a.division === "object" && a.division?.slug ? a.division.slug : "";
		const bDivSlug =
			typeof b.division === "object" && b.division?.slug ? b.division.slug : "";

		const aIndex = orderedDivisionSlugs.indexOf(aDivSlug);
		const bIndex = orderedDivisionSlugs.indexOf(bDivSlug);

		if (aIndex !== bIndex) {
			return aIndex - bIndex;
		}

		return a.name.localeCompare(b.name);
	});

	// Error state - only show if error persists
	if (shouldShowError) {
		return (
			<ErrorState
				message="Failed to load users. Please try again."
				onRetry={refetch}
			/>
		);
	}

	// Empty state (no users at all)
	const showEmptyState =
		data?.users.length === 0 && !userSearchStore.hasActiveFilters;

	// No results state (search/filter returned nothing)
	const showNoResults =
		data?.users.length === 0 && userSearchStore.hasActiveFilters;

	return (
		<PageTransition isLoading={isLoading}>
			<div className="w-full">
				{/* Breadcrumb */}
				<AutoBreadcrumb />

				{/* Page header */}
				<div className="flex w-full mt-2 mb-6 flex-row">
					<div className="flex-1 w-full flex-col">
						<h1 className="text-2xl font-bold">
							Users ({userSearchStore.state.totalResults})
						</h1>
						<p className="text-sm text-gray-600 dark:text-gray-200">
							Search a user above. You can also use the filters below.
						</p>
					</div>

					{/* Create button - admin only */}
					<div className="flex flex-1 w-full justify-end items-center">
						{authStore.isSuperuser && (
							<NavigationButton
								targetPath="/users/create"
								className="ml-4 bg-green-600 hover:bg-green-600 text-white dark:bg-green-600 dark:hover:bg-green-400"
							>
								Add User
							</NavigationButton>
						)}
					</div>
				</div>

				{/* Filter container */}
				<div className="grid grid-cols-1 items-center border border-gray-300 dark:border-gray-500 w-full select-none mb-0">
					<div className="col-span-full pb-4">
						<div className="p-4 border-b border-gray-300 dark:border-gray-500 w-full space-y-3">
							<ResponsiveLayout
								mobileContent={
									<div className="flex flex-col gap-4">
										{/* Search Input - visual position 1 on mobile */}
										<UserSearchBar
											value={userSearchStore.state.searchTerm}
											onChange={handleSearchChange}
										/>

										{/* Business Area + Filters - visual position 2 on mobile */}
										<UserFilterPanel
											filters={userSearchStore.state.filters}
											onFiltersChange={handleFiltersChange}
										/>

										{/* Remember my search and Clear - visual position 3 on mobile (at the bottom) */}
										<div className="flex gap-2 justify-end">
											<SearchControls
												saveSearch={userSearchStore.state.saveSearch}
												onToggleSaveSearch={handleToggleSaveSearch}
												filterCount={userSearchStore.filterCount}
												onClearFilters={handleClearFilters}
												className="flex gap-2 ml-auto"
											/>
										</div>
									</div>
								}
								desktopContent={
									<div className="space-y-3">
										{/* Row 1: Business Area (left) and Search (right) */}
										<div className="flex flex-row gap-4">
											{/* Business Area Dropdown - left side, row 1 */}
											<div className="flex-1">
												<Select
													value={
														userSearchStore.state.filters.businessArea?.toString() ||
														"All"
													}
													onValueChange={(value) => {
														handleFiltersChange({
															...userSearchStore.state.filters,
															businessArea:
																value === "All" ? undefined : Number(value),
														});
													}}
													disabled={isLoadingBusinessAreas}
												>
													<SelectTrigger
														className="w-full !h-10 text-sm rounded-md"
														aria-label="Filter by business area"
													>
														<SelectValue placeholder="All Business Areas" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="All">
															All Business Areas
														</SelectItem>
														{sortedBusinessAreas
															?.filter(
																(ba): ba is typeof ba & { id: number } =>
																	ba.id !== undefined
															)
															.map((ba) => (
																<SelectItem
																	key={ba.id}
																	value={ba.id.toString()}
																>
																	{typeof ba.division === "object" &&
																	ba.division?.slug
																		? `[${ba.division.slug}] `
																		: ""}
																	{ba.name}
																	{!ba.is_active ? " (INACTIVE)" : ""}
																</SelectItem>
															))}
													</SelectContent>
												</Select>
											</div>

											{/* Search Input - right side, row 1 */}
											<div className="flex-1">
												<UserSearchBar
													value={userSearchStore.state.searchTerm}
													onChange={handleSearchChange}
												/>
											</div>
										</div>

										{/* Row 2: Role Filter (left) and Remember Search (right) */}
										<div className="flex flex-row gap-4 items-start">
											{/* Role Filter Dropdown - left side, row 2 */}
											<div className="flex-1">
												<Select
													value={
														userSearchStore.state.filters.roleFilter || "all"
													}
													onValueChange={(value) => {
														handleFiltersChange({
															...userSearchStore.state.filters,
															roleFilter: value as RoleFilter,
														});
													}}
												>
													<SelectTrigger
														className="w-full !h-10 text-sm rounded-md"
														aria-label="Filter by user role"
													>
														<SelectValue placeholder="All Users" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="all">All Users</SelectItem>
														<SelectItem value="external">
															Only External
														</SelectItem>
														<SelectItem value="staff">Only Staff</SelectItem>
														<SelectItem value="ba_lead">
															Only BA Lead
														</SelectItem>
														<SelectItem value="approver">
															Only Approver
														</SelectItem>
														<SelectItem value="key_stakeholder">
															Only Key Stakeholder
														</SelectItem>
														<SelectItem value="admin">Only Admin</SelectItem>
													</SelectContent>
												</Select>
											</div>

											{/* Remember Search Controls - right side, row 2 */}
											<div className="flex-1 flex justify-end">
												<SearchControls
													saveSearch={userSearchStore.state.saveSearch}
													onToggleSaveSearch={handleToggleSaveSearch}
													filterCount={userSearchStore.filterCount}
													onClearFilters={handleClearFilters}
													className="flex gap-2"
												/>
											</div>
										</div>
									</div>
								}
							/>
						</div>
					</div>

					{/* Column headers */}
					<div className="grid grid-cols-1 lg:grid-cols-[8fr_4fr] xl:grid-cols-[4fr_4fr_2.5fr] pt-0 pb-4 pl-6">
						<div className="w-full overflow-hidden text-ellipsis">
							<span className="font-bold">User</span>
						</div>
						<div className="hidden lg:block w-full overflow-hidden text-ellipsis">
							<span className="font-bold">Email</span>
						</div>
						<div className="hidden xl:block w-full overflow-hidden text-ellipsis">
							<span className="font-bold">Business Area</span>
						</div>
					</div>
				</div>

				{/* User grid */}
				<UserGrid users={data?.users || []} isLoading={false} />

				{/* Empty state */}
				{showEmptyState && (
					<EmptyState
						title="No users found"
						description="There are no users in the system yet."
					/>
				)}

				{/* No results state */}
				{showNoResults && (
					<NoResultsState
						searchTerm={userSearchStore.state.searchTerm}
						onClear={handleClearFilters}
					/>
				)}

				{/* Pagination */}
				{data && data.total_pages > 1 && (
					<Pagination
						currentPage={userSearchStore.state.currentPage}
						totalPages={data.total_pages}
						onPageChange={handlePageChange}
						startIndex={(userSearchStore.state.currentPage - 1) * 20}
						endIndex={Math.min(
							userSearchStore.state.currentPage * 20,
							data.total_results
						)}
						totalItems={data.total_results}
						itemLabel="users"
					/>
				)}

				{/* User Detail Sheet */}
				<UserDetailSheet
					userId={selectedUserId}
					open={shouldShowSheet}
					onClose={handleCloseSheet}
				/>
			</div>
		</PageTransition>
	);
});

export default UserListPage;
