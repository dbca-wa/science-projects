/**
 * Mutations for a project plan's related projects
 *
 * Each awaits a refetch of the plan and project data before resolving, so the
 * section on screen is current when the caller announces the change.
 */

import {
	useMutation,
	useQueryClient,
	type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
	addRelatedProject,
	clearLegacyRelatedProjects,
	removeRelatedProject,
} from "@/features/projects/services/related-project.service";
import type { ApiError } from "@/shared/services/api/client.service";
import { extractUserFriendlyMessage } from "@/shared/utils/error.utils";

const isApiError = (error: unknown): error is ApiError =>
	typeof error === "object" &&
	error !== null &&
	"status" in error &&
	"message" in error;

/**
 * The API's reason for rejecting the change. Validation errors name the
 * related_project field; use that message without the field name.
 */
const getErrorMessage = (error: Error, fallback: string): string => {
	const fieldMessage = isApiError(error)
		? error.fieldErrors?.related_project?.[0]
		: undefined;
	return fieldMessage ?? extractUserFriendlyMessage(error, fallback);
};

const refreshPlanAndProject = async (
	queryClient: QueryClient,
	projectId: number
) => {
	await queryClient.invalidateQueries({
		predicate: (query) => {
			const key = query.queryKey;
			if (!Array.isArray(key)) return false;
			// ["project-plans", ...]
			if (key[0] === "project-plans") return true;
			// ["projects", "detail", id] with the id as a number or string
			return (
				key[0] === "projects" &&
				key[1] === "detail" &&
				(key[2] === projectId || key[2] === String(projectId))
			);
		},
	});
};

/** Add a project to the list, or accept a suggestion */
export const useAddRelatedProject = (planId: number, projectId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (relatedProjectId: number) =>
			addRelatedProject(planId, relatedProjectId),
		onSuccess: async () => {
			await refreshPlanAndProject(queryClient, projectId);
		},
		onError: (error: Error) => {
			toast.error(getErrorMessage(error, "Could not add the related project"));
		},
	});
};

/** Remove a project from the list, or dismiss a suggestion */
export const useRemoveRelatedProject = (planId: number, projectId: number) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (rowId: number) => removeRelatedProject(planId, rowId),
		onSuccess: async () => {
			await refreshPlanAndProject(queryClient, projectId);
		},
		onError: (error: Error) => {
			toast.error(
				getErrorMessage(error, "Could not remove the related project")
			);
		},
	});
};

/** Clear the plan's legacy free text */
export const useClearLegacyRelatedProjects = (
	planId: number,
	projectId: number
) => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => clearLegacyRelatedProjects(planId),
		onSuccess: async () => {
			await refreshPlanAndProject(queryClient, projectId);
		},
		onError: (error: Error) => {
			toast.error(
				getErrorMessage(error, "Could not clear the previously recorded text")
			);
		},
	});
};
