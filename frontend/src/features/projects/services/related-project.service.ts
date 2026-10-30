/**
 * Related projects service
 *
 * Adds projects to a project plan's related projects list (which also accepts
 * a suggestion), removes them (which also dismisses a suggestion), and clears
 * the legacy free text.
 */

import { apiClient } from "@/shared/services/api/client.service";
import type { IRelatedProject } from "@/shared/types/document.types";
import { RELATED_PROJECT_ENDPOINTS } from "./related-project.endpoints";

export const addRelatedProject = async (
	planId: number,
	projectId: number
): Promise<IRelatedProject> => {
	return apiClient.post<IRelatedProject>(
		RELATED_PROJECT_ENDPOINTS.ADD(planId),
		{
			related_project: projectId,
		}
	);
};

export const removeRelatedProject = async (
	planId: number,
	rowId: number
): Promise<void> => {
	await apiClient.delete(RELATED_PROJECT_ENDPOINTS.REMOVE(planId, rowId));
};

/** Remove the plan's legacy free text, once its projects are in the list */
export const clearLegacyRelatedProjects = async (
	planId: number
): Promise<void> => {
	await apiClient.delete(RELATED_PROJECT_ENDPOINTS.LEGACY_TEXT(planId));
};
