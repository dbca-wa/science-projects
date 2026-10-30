/**
 * Related projects API endpoints for project plans
 */
export const RELATED_PROJECT_ENDPOINTS = {
	ADD: (planId: number) => `documents/projectplans/${planId}/related_projects`,
	REMOVE: (planId: number, rowId: number) =>
		`documents/projectplans/${planId}/related_projects/${rowId}`,
	LEGACY_TEXT: (planId: number) =>
		`documents/projectplans/${planId}/related_projects/legacy_text`,
} as const;
