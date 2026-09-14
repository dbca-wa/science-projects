/**
 * Hooks for managing document edit exceptions.
 *
 * Provides an admin query for a document's active exceptions and eligible
 * users, plus mutations to grant, extend, and revoke access. Mutations
 * invalidate the owning project's detail query so the document data (and its
 * edit-exception state) refreshes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractUserFriendlyMessage } from "@/shared/utils/error.utils";
import {
	createEditException,
	extendEditException,
	getDocumentEditExceptions,
	revokeEditException,
} from "../services/edit-exception.service";
import { projectKeys } from "./useProjects";

export const editExceptionKeys = {
	all: ["edit-exceptions"] as const,
	document: (documentId: number) =>
		[...editExceptionKeys.all, "document", documentId] as const,
};

/**
 * Query a document's active exceptions and eligible users (admin only).
 *
 * @param documentId - The ProjectDocument id
 * @param enabled - Only fetch when true (e.g. when the modal is open)
 */
export const useDocumentEditExceptions = (
	documentId: number,
	enabled: boolean
) => {
	return useQuery({
		queryKey: editExceptionKeys.document(documentId),
		queryFn: () => getDocumentEditExceptions(documentId),
		enabled: enabled && !!documentId,
		staleTime: 30_000,
	});
};

interface MutationContext {
	projectId: number;
	documentId: number;
}

/** Grant an edit exception, then refresh document and project data. */
export const useCreateEditException = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			documentId,
			userId,
			days,
		}: MutationContext & { userId: number; days: number }) =>
			createEditException(documentId, userId, days),
		onSuccess: (_data, variables) => {
			toast.success("Edit access granted");
			queryClient.invalidateQueries({
				queryKey: editExceptionKeys.document(variables.documentId),
			});
			queryClient.invalidateQueries({
				queryKey: projectKeys.detail(variables.projectId),
			});
		},
		onError: (error: Error) => {
			toast.error(
				extractUserFriendlyMessage(error, "Failed to grant edit access")
			);
		},
	});
};

/** Extend an edit exception, then refresh document and project data. */
export const useExtendEditException = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			exceptionId,
			days,
		}: MutationContext & { exceptionId: number; days: number }) =>
			extendEditException(exceptionId, days),
		onSuccess: (_data, variables) => {
			toast.success("Edit access extended");
			queryClient.invalidateQueries({
				queryKey: editExceptionKeys.document(variables.documentId),
			});
			queryClient.invalidateQueries({
				queryKey: projectKeys.detail(variables.projectId),
			});
		},
		onError: (error: Error) => {
			toast.error(
				extractUserFriendlyMessage(error, "Failed to extend edit access")
			);
		},
	});
};

/** Revoke an edit exception, then refresh document and project data. */
export const useRevokeEditException = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ exceptionId }: MutationContext & { exceptionId: number }) =>
			revokeEditException(exceptionId),
		onSuccess: (_data, variables) => {
			toast.success("Edit access revoked");
			queryClient.invalidateQueries({
				queryKey: editExceptionKeys.document(variables.documentId),
			});
			queryClient.invalidateQueries({
				queryKey: projectKeys.detail(variables.projectId),
			});
		},
		onError: (error: Error) => {
			toast.error(
				extractUserFriendlyMessage(error, "Failed to revoke edit access")
			);
		},
	});
};
