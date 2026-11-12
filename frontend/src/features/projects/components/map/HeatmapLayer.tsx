import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import type { Layer } from "leaflet";
import { HeatLayer } from "leaflet.heat";
import type { IProjectData } from "@/shared/types/project.types";
import type { GeoJSONData } from "@/features/projects/types/map.types";
import { calculateCoordinates } from "@/features/projects/utils/map/coordinate-calculation.utils";
import { logger } from "@/shared/services/logger.service";

/**
 * Heatmap configuration for optimal density visualization
 * Increased radius and intensity for better visibility
 */
const HEATMAP_CONFIG = {
	radius: 50, // Increased heat radius for better visibility
	blur: 25, // Increased blur for smoother transitions
	maxZoom: 18, // Maximum zoom level for heatmap visibility
	minOpacity: 0.3, // Minimum opacity to ensure visibility
	gradient: {
		// Enhanced color gradient with better contrast
		0.0: "#0066ff", // bright blue (low density)
		0.2: "#6600ff", // bright purple
		0.4: "#ff6600", // bright orange
		0.6: "#ff0000", // bright red
		1.0: "#cc0000", // dark red (high density)
	},
};

/** A heatmap point: latitude, longitude and intensity. */
type HeatmapPoint = [number, number, number];

/**
 * The parts of a leaflet.heat layer used here, as seen by Leaflet 1.x.
 *
 * leaflet.heat's bundled types extend Leaflet 2's generic `Layer`, which
 * @types/leaflet 1.x does not have, so the class loses its `Layer` members
 * (addTo and others). This restores them.
 */
type HeatmapLayerInstance = Layer & {
	setLatLngs(points: HeatmapPoint[]): HeatmapLayerInstance;
};

const createHeatLayer = (points: HeatmapPoint[]): HeatmapLayerInstance =>
	new HeatLayer(points, HEATMAP_CONFIG) as unknown as HeatmapLayerInstance;

/**
 * HeatmapLayer Props
 */
interface HeatmapLayerProps {
	projects: IProjectData[];
	geoJsonData: GeoJSONData;
	isVisible: boolean;
}

/**
 * Convert projects to heatmap points format with caching
 *
 * @param projects - Array of projects to convert
 * @param geoJsonData - GeoJSON data for coordinate calculation
 * @returns Array of heatmap points [lat, lng, intensity]
 */
function convertProjectsToHeatmapPoints(
	projects: IProjectData[],
	geoJsonData: GeoJSONData
): [number, number, number][] {
	const heatmapPoints: [number, number, number][] = [];

	// Calculate base intensity based on total project count for better scaling
	const baseIntensity = Math.max(1, Math.min(5, projects.length / 50));

	for (const project of projects) {
		const coords = calculateCoordinates(project, geoJsonData);
		if (coords) {
			// Use dynamic intensity based on project count for better visibility
			heatmapPoints.push([coords[0], coords[1], baseIntensity]);
		}
	}

	logger.debug("Converted projects to heatmap points", {
		totalProjects: projects.length,
		validPoints: heatmapPoints.length,
		invalidProjects: projects.length - heatmapPoints.length,
		baseIntensity,
	});

	return heatmapPoints;
}

/**
 * HeatmapLayer component
 *
 * Renders a density heatmap visualization using Leaflet.heat plugin.
 * Shows project concentration across Western Australia using color gradients.
 *
 * Features:
 * - Uses same coordinate calculation as markers for consistency
 * - Configurable radius, blur, and color gradient
 * - Proper lifecycle management (creation, updates, cleanup)
 * - Memory leak prevention with proper layer removal
 * - Performance optimised with caching and memoisation
 * - Handles large datasets efficiently (1000+ projects)
 */
export const HeatmapLayer = ({
	projects,
	geoJsonData,
	isVisible,
}: HeatmapLayerProps) => {
	const map = useMap();
	const heatmapRef = useRef<HeatmapLayerInstance | null>(null);
	const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Memoize heatmap points calculation for performance
	// Only recalculates when projects or geoJsonData actually change
	const heatmapPoints = useMemo(() => {
		if (!isVisible || !geoJsonData) return [];

		const points = convertProjectsToHeatmapPoints(projects, geoJsonData);

		logger.debug("Heatmap points calculated", {
			projectCount: projects.length,
			pointCount: points.length,
		});

		return points;
	}, [projects, geoJsonData, isVisible]);

	useEffect(() => {
		// Remove existing heatmap if not visible
		if (!isVisible) {
			if (heatmapRef.current) {
				try {
					map.removeLayer(heatmapRef.current);
					heatmapRef.current = null;
					logger.debug("Heatmap layer removed (not visible)");
				} catch (error) {
					logger.error("Error removing heatmap layer", {
						errorMessage:
							error instanceof Error ? error.message : String(error),
					});
				}
			}
			return;
		}

		// Debounced heatmap update function
		const updateHeatmap = (points: [number, number, number][]) => {
			// Clear any pending updates
			if (updateTimeoutRef.current) {
				clearTimeout(updateTimeoutRef.current);
			}

			// Debounce updates to prevent excessive re-rendering during rapid filter changes
			updateTimeoutRef.current = setTimeout(() => {
				try {
					if (heatmapRef.current) {
						// Update existing layer with new data
						heatmapRef.current.setLatLngs(points);
						logger.debug("Heatmap layer updated with new data", {
							pointCount: points.length,
						});
					} else if (points.length > 0) {
						// Create new heatmap layer
						heatmapRef.current = createHeatLayer(points);
						heatmapRef.current.addTo(map);
						logger.debug("Heatmap layer created and added to map", {
							pointCount: points.length,
							config: HEATMAP_CONFIG,
						});
					}
				} catch (error) {
					logger.error("Error updating heatmap layer", {
						errorMessage:
							error instanceof Error ? error.message : String(error),
						pointCount: points.length,
					});

					// Clean up on error
					if (heatmapRef.current) {
						try {
							map.removeLayer(heatmapRef.current);
							heatmapRef.current = null;
						} catch (cleanupError) {
							logger.error("Error during heatmap cleanup", {
								errorMessage:
									cleanupError instanceof Error
										? cleanupError.message
										: String(cleanupError),
							});
						}
					}
				}
			}, 100); // 100ms debounce delay
		};

		// Update heatmap with new points (debounced)
		updateHeatmap(heatmapPoints);
	}, [map, heatmapPoints, isVisible]);

	// Cleanup on component unmount
	useEffect(() => {
		return () => {
			// Clear any pending updates
			if (updateTimeoutRef.current) {
				clearTimeout(updateTimeoutRef.current);
			}

			// Remove heatmap layer
			if (heatmapRef.current) {
				try {
					map.removeLayer(heatmapRef.current);
					heatmapRef.current = null;
					logger.debug("Heatmap layer cleaned up on unmount");
				} catch (error) {
					logger.error("Error during heatmap cleanup on unmount", {
						errorMessage:
							error instanceof Error ? error.message : String(error),
					});
				}
			}
		};
	}, [map]);

	// This component doesn't render JSX - it manages Leaflet layers directly
	return null;
};
