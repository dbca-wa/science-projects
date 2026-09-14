/**
 * Service for managing document edit exceptions.
 *
 * Administrators use these calls to grant, view, extend, and revoke
 * time-limited edit access to locked project documents.
 */

import { apiClient } from "@/shared/services/api/client.service";
import type {
	IDocumentEditException,
	IEditExceptionUser,
} from "@/shared/types/document.types";
import { EDIT_EXCEPTION_ENDPOINTS } from "./edit-exception.endpoints";

export interface IEditExceptionListResponse {
	active_exceptions: IDocumentEditException[];
	eligible_users: IEditExceptionUser[];
}

/** List active exceptions and eligible users for a document (admin only). */
export const getDocumentEditExceptions = async (
	documentId: number
): Promise<IEditExceptionListResponse> => {
	return apiClient.get<IEditExceptionListResponse>(
		EDIT_EXCEPTION_ENDPOINTS.LIST(documentId)
	);
};

/** Grant an edit exception to an eligible user (admin only). */
export const createEditException = async (
	documentId: number,
	userId: number,
	days: number
): Promise<IDocumentEditException> => {
	return apiClient.post<IDocumentEditException>(
		EDIT_EXCEPTION_ENDPOINTS.CREATE(documentId),
		{ user_id: userId, days }
	);
};

/** Extend an existing edit exception (admin only). */
export const extendEditException = async (
	exceptionId: number,
	days: number
): Promise<IDocumentEditException> => {
	return apiClient.patch<IDocumentEditException>(
		EDIT_EXCEPTION_ENDPOINTS.EXTEND(exceptionId),
		{ days }
	);
};

/** Revoke (delete) an edit exception (admin only). */
export const revokeEditException = async (
	exceptionId: number
): Promise<void> => {
	await apiClient.delete<void>(EDIT_EXCEPTION_ENDPOINTS.REVOKE(exceptionId));
};
