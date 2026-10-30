/**
 * Project search service
 *
 * Lightweight project lookup for pickers such as ProjectCombobox. Matches
 * titles, keywords and project tags (e.g. "SP-2024-11"), up to 20 results.
 */

import { apiClient } from "@/shared/services/api/client.service";
import type { IProjectSearchResult } from "@/shared/types/project.types";

export const PROJECT_SEARCH_ENDPOINTS = {
	SMALL_SEARCH: "projects/smallsearch",
} as const;

export const searchProjects = async (
	searchTerm: string
): Promise<IProjectSearchResult[]> => {
	return apiClient.get<IProjectSearchResult[]>(
		PROJECT_SEARCH_ENDPOINTS.SMALL_SEARCH,
		{ params: { searchTerm } }
	);
};
