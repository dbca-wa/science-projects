/**
 * Endpoints for document edit exceptions.
 *
 * Note: base URL already includes /api/v1/, so paths start after that.
 */
export const EDIT_EXCEPTION_ENDPOINTS = {
	LIST: (documentId: number) =>
		`documents/projectdocuments/${documentId}/edit-exceptions`,
	CREATE: (documentId: number) =>
		`documents/projectdocuments/${documentId}/edit-exceptions`,
	EXTEND: (exceptionId: number) => `documents/edit-exceptions/${exceptionId}`,
	REVOKE: (exceptionId: number) => `documents/edit-exceptions/${exceptionId}`,
} as const;
