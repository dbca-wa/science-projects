import { useEffect } from "react";

/**
 * Screen reader announcement utilities
 *
 * Provides functions to announce state changes to screen readers
 * using ARIA live regions for better accessibility.
 */

/**
 * Create or get the live region element for screen reader announcements
 */
function getLiveRegion(): HTMLElement {
	let liveRegion = document.getElementById("screen-reader-announcements");

	if (!liveRegion) {
		liveRegion = document.createElement("div");
		liveRegion.id = "screen-reader-announcements";
		liveRegion.setAttribute("aria-live", "polite");
		liveRegion.setAttribute("aria-atomic", "true");
		liveRegion.style.position = "absolute";
		liveRegion.style.left = "-10000px";
		liveRegion.style.width = "1px";
		liveRegion.style.height = "1px";
		liveRegion.style.overflow = "hidden";
		document.body.appendChild(liveRegion);
	}

	return liveRegion;
}

/**
 * Announce a message to screen readers
 *
 * @param message - The message to announce
 * @param priority - 'polite' (default) or 'assertive' for urgent announcements
 */
export function announceToScreenReader(
	message: string,
	priority: "polite" | "assertive" = "polite"
): void {
	// Nothing to announce to when there is no DOM (a late timer after the
	// page or test environment has been torn down)
	if (typeof document === "undefined") return;

	const liveRegion = getLiveRegion();
	liveRegion.setAttribute("aria-live", priority);

	// Clear previous message first
	liveRegion.textContent = "";

	// Add new message after a brief delay to ensure it's announced
	setTimeout(() => {
		liveRegion.textContent = message;
	}, 100);

	// Clear the message after announcement to avoid repetition
	setTimeout(() => {
		liveRegion.textContent = "";
	}, 3000);
}

/**
 * Announce map state changes
 */
export const mapAnnouncements = {
	/**
	 * Announce when map enters/exits fullscreen
	 */
	fullscreenToggle: (isFullscreen: boolean) => {
		const message = isFullscreen
			? "Map is now in fullscreen mode. Press Escape or click the minimize button to exit."
			: "Map has exited fullscreen mode.";
		announceToScreenReader(message);
	},

	/**
	 * Announce when layers are toggled
	 */
	layerToggle: (layerName: string, isVisible: boolean) => {
		const message = isVisible
			? `${layerName} layer is now visible on the map.`
			: `${layerName} layer is now hidden from the map.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when all layers are shown/hidden
	 */
	allLayersToggle: (action: "show" | "hide") => {
		const message =
			action === "show"
				? "All map layers are now visible."
				: "All map layers are now hidden.";
		announceToScreenReader(message);
	},

	/**
	 * Announce when display options change
	 */
	displayOptionToggle: (option: "labels" | "colors", isEnabled: boolean) => {
		const optionName = option === "labels" ? "region labels" : "region colors";
		const message = isEnabled
			? `${optionName} are now shown on the map.`
			: `${optionName} are now hidden from the map.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when map view is reset
	 */
	viewReset: () => {
		announceToScreenReader(
			"Map view has been reset to show Western Australia."
		);
	},

	/**
	 * Announce when filters are applied
	 */
	filtersApplied: (projectCount: number, totalProjects: number) => {
		const message = `Filters applied. Showing ${projectCount} of ${totalProjects} projects on the map.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when filters are cleared
	 */
	filtersCleared: (totalProjects: number) => {
		const message = `All filters cleared. Showing all ${totalProjects} projects on the map.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when search is performed
	 */
	searchPerformed: (searchTerm: string, resultCount: number) => {
		const message = searchTerm
			? `Search for "${searchTerm}" found ${resultCount} projects.`
			: `Search cleared. Showing all projects.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when marker is selected
	 */
	markerSelected: (projectCount: number) => {
		const message =
			projectCount === 1
				? "Project marker selected. Popup opened with project details."
				: `Cluster marker selected. Popup opened with ${projectCount} projects.`;
		announceToScreenReader(message);
	},

	/**
	 * Announce when popup is closed
	 */
	popupClosed: () => {
		announceToScreenReader("Project popup closed.");
	},
};

/**
 * Hook to set up screen reader announcements
 * Call this in the main map component to initialise
 */
export function useScreenReaderAnnouncements() {
	// Initialise the live region on mount
	useEffect(() => {
		getLiveRegion();
	}, []);
}
