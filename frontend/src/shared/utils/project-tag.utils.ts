import type { IProjectData, ProjectKind } from "@/shared/types/project.types";

/**
 * Project Tag Utilities
 *
 * Utilities for formatting project tags.
 * Project tags follow the format: {type}-{year}-{number}
 * where type is SP/STP/EXT/CF based on project kind.
 */

/**
 * Map project kind to tag type prefix
 */
const PROJECT_KIND_TO_TYPE: Record<ProjectKind, string> = {
	science: "SP",
	student: "STP",
	external: "EXT",
	core_function: "CF",
};

/**
 * Format complete project tag
 *
 * Format: {type}-{year}-{number}
 * Examples:
 * - "SP-2024-6" (single year)
 * - "SP-2024-2025-6" (year range)
 * - "SP-2024--6" (open-ended range)
 */
export function formatProjectTag(
	project: Pick<IProjectData, "kind" | "year" | "number">
): string {
	const type = PROJECT_KIND_TO_TYPE[project.kind];

	// Handle missing year gracefully
	if (!project.year) {
		return `${type}--${project.number}`;
	}

	// For now, use the year field as both start and end
	// TODO: Update when start_year and end_year fields are available
	const year = project.year.toString();

	return `${type}-${year}-${project.number}`;
}
