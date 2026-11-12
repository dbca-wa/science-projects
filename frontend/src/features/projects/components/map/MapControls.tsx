import { observer } from "mobx-react-lite";
import { Maximize, Minimize, RotateCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type L from "leaflet";
import { Button } from "@/shared/components/ui/button";
import { LayerPopover } from "./LayerPopover";
import { HeatmapToggle } from "./HeatmapToggle";
import { useProjectMapStore } from "@/app/stores/store-context";
import { mapAnnouncements } from "@/shared/utils/screen-reader.utils";

/**
 * ZoomControls component
 *
 * Zoom controls positioned in the top-left corner, to the right of the MapStats badge.
 * Positioned with left offset to account for MapStats width.
 */
// const ZoomControls = observer(() => {
// 	const map = useMap();
// 	const containerRef = useRef<HTMLDivElement>(null);

// 	useEffect(() => {
// 		if (containerRef.current) {
// 			L.DomEvent.disableClickPropagation(containerRef.current);
// 			L.DomEvent.disableScrollPropagation(containerRef.current);
// 		}
// 	}, []);

// 	const handleZoomIn = (e: React.MouseEvent) => {
// 		e.stopPropagation();
// 		e.preventDefault();
// 		map.zoomIn();
// 	};

// 	const handleZoomOut = (e: React.MouseEvent) => {
// 		e.stopPropagation();
// 		e.preventDefault();
// 		map.zoomOut();
// 	};

// 	return (
// 		<div
// 			ref={containerRef}
// 			className="absolute top-4 z-30 flex flex-col gap-1 leaflet-control"
// 			style={{
// 				left: "calc(1rem + max(8rem, min(calc(100vw - 8rem), 12rem)) + 0.5rem)",
// 			}}
// 			onMouseDown={(e) => e.stopPropagation()}
// 			onMouseMove={(e) => e.stopPropagation()}
// 			onMouseUp={(e) => e.stopPropagation()}
// 			onDragStart={(e) => {
// 				e.stopPropagation();
// 				e.preventDefault();
// 			}}
// 			onDoubleClick={(e) => {
// 				e.stopPropagation();
// 				e.preventDefault();
// 			}}
// 		>
// 			<Button
// 				variant="outline"
// 				size="sm"
// 				onClick={handleZoomIn}
// 				className="h-8 w-8 p-0 bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
// 				aria-label="Zoom in"
// 				title="Zoom in"
// 			>
// 				<ZoomIn className="h-4 w-4" />
// 			</Button>
// 			<Button
// 				variant="outline"
// 				size="sm"
// 				onClick={handleZoomOut}
// 				className="h-8 w-8 p-0 bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
// 				aria-label="Zoom out"
// 				title="Zoom out"
// 			>
// 				<ZoomOut className="h-4 w-4" />
// 			</Button>
// 		</div>
// 	);
// });

/**
 * MapControlButtons component
 *
 * Map control buttons that can be rendered inside or outside the Leaflet map.
 * When rendered outside, they don't need Leaflet event prevention.
 */
const MapControlButtons = observer(() => {
	const store = useProjectMapStore();
	const [isMapFullscreen, setIsMapFullscreen] = useState(false);
	const announceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

	// A pending announcement must not outlive the component
	useEffect(() => {
		return () => clearTimeout(announceTimer.current);
	}, []);

	// Listen for fullscreen changes
	useEffect(() => {
		const handleFullscreenChange = () => {
			setIsMapFullscreen(store.state.mapFullscreen || false);
		};

		// Listen to store changes for map fullscreen state
		handleFullscreenChange();
	}, [store.state.mapFullscreen]);

	const handleMapFullscreen = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const wasFullscreen = store.state.mapFullscreen;
		store.toggleMapFullscreen();

		// Announce the change after a brief delay to ensure state has updated
		clearTimeout(announceTimer.current);
		announceTimer.current = setTimeout(() => {
			mapAnnouncements.fullscreenToggle(!wasFullscreen);
		}, 100);
	};

	const handleResetView = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		// Get the map instance from the window (set by FullMapContainer)
		const map = (window as Window & { __leafletMap?: L.Map }).__leafletMap;
		if (map) {
			// Reset to Western Australia view
			map.setView([-25.2744, 122.2402], 6);
			mapAnnouncements.viewReset();
		}
	};

	return (
		<>
			{/* Map Actions - Fullscreen and Reset in same row, matching layers button width */}
			<div className="flex gap-1">
				<Button
					variant="outline"
					size="sm"
					onClick={handleResetView}
					className="flex-1 h-8 p-0 bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
					aria-label="Reset map view to Western Australia"
					title="Reset"
				>
					<RotateCcw className="h-4 w-4" />
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleMapFullscreen}
					className={`flex-1 h-8 p-0 shadow-lg hover:shadow-xl transition-all ${
						isMapFullscreen
							? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-900/80 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-800 dark:hover:border-blue-600"
							: "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
					}`}
					aria-label={
						isMapFullscreen ? "Exit map fullscreen" : "Enter map fullscreen"
					}
					title="Toggle Fullscreen"
				>
					{isMapFullscreen ? (
						<Minimize className="h-4 w-4" />
					) : (
						<Maximize className="h-4 w-4" />
					)}
				</Button>
			</div>

			{/* Heatmap Toggle - Full width button */}
			<HeatmapToggle />

			{/* Layer Controls - Always rendered for tab order, but visually hidden on mobile */}
			<LayerPopover isFullscreen={isMapFullscreen} />
		</>
	);
});

/**
 * MapControls component
 *
 * Floating action buttons for map interaction controls.
 * Can be rendered inside or outside the Leaflet MapContainer.
 *
 * Features:
 * - Map fullscreen toggle (not browser fullscreen)
 * - Reset view button (fit all markers)
 * - Heatmap toggle
 * - Layer controls via LayerPopover
 * - Proper ARIA labels and keyboard support
 */
export const MapControls = observer(() => {
	return <MapControlButtons />;
});
