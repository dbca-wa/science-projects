import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
import type { IProjectData } from "@/shared/types/project.types";
import type { GeoJSONData } from "@/features/projects/types/map.types";
import { HeatmapLayer } from "./HeatmapLayer";

// jsdom has no canvas drawing, so each canvas gets a stand-in 2D context that
// records calls. Leaflet, leaflet.heat and simpleheat all run for real.
const drawCalls: string[] = [];
const gradientStops: string[] = [];

const fakeContext = (canvas: HTMLCanvasElement) =>
	new Proxy({ canvas } as Record<string | symbol, unknown>, {
		get(target, key) {
			if (key in target) return target[key];
			if (key === "getImageData") {
				return (_x: number, _y: number, w: number, h: number) => ({
					data: new Uint8ClampedArray(w * h * 4),
					width: w,
					height: h,
				});
			}
			if (key === "createLinearGradient") {
				return () => ({
					addColorStop: (_offset: number, colour: string) =>
						gradientStops.push(colour),
				});
			}
			return (..._args: unknown[]) => {
				drawCalls.push(String(key));
			};
		},
		set(target, key, value) {
			target[key] = value;
			return true;
		},
	});

vi.mock("@/features/projects/utils/map/coordinate-calculation.utils", () => ({
	calculateCoordinates: vi.fn(() => [-25.2744, 122.2402]),
}));

const logger = vi.hoisted(() => ({
	debug: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	info: vi.fn(),
}));

vi.mock("@/shared/services/logger.service", () => ({ logger }));

const geoJsonData: GeoJSONData = {
	dbcaRegions: null,
	dbcaDistricts: null,
	nrm: null,
	ibra: null,
	imcra: null,
};

const project = { id: 1 } as IProjectData;
const otherProject = { id: 2 } as IProjectData;

const renderHeatmap = (projects: IProjectData[], isVisible = true) => (
	<MapContainer
		center={[-25, 122]}
		zoom={5}
		style={{ height: "400px", width: "400px" }}
	>
		<HeatmapLayer
			projects={projects}
			geoJsonData={geoJsonData}
			isVisible={isVisible}
		/>
	</MapContainer>
);

const layers = (container: HTMLElement) =>
	container.querySelectorAll("canvas.leaflet-heatmap-layer");

// The component debounces layer updates by 100 ms
const settle = () => act(() => vi.advanceTimersByTime(150));

describe("HeatmapLayer", () => {
	beforeEach(() => {
		// jsdom does no layout, so the map reads its size as 0x0 and nothing
		// would be drawn; give elements the size the test map is styled with
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
		// leaflet.heat redraws on the next animation frame
		vi.useFakeTimers({
			toFake: [
				"setTimeout",
				"clearTimeout",
				"requestAnimationFrame",
				"cancelAnimationFrame",
			],
		});
		vi.clearAllMocks();
		drawCalls.length = 0;
		gradientStops.length = 0;
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			function (this: HTMLCanvasElement) {
				return fakeContext(this);
			} as unknown as typeof HTMLCanvasElement.prototype.getContext
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("adds a heatmap layer to the map and draws it with the configured colours", async () => {
		const { container } = render(renderHeatmap([project]));
		await settle();

		expect(layers(container)).toHaveLength(1);
		expect([...gradientStops].sort()).toEqual(
			["#0066ff", "#6600ff", "#ff6600", "#ff0000", "#cc0000"].sort()
		);
		expect(drawCalls).toContain("putImageData");
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("adds nothing when there are no points to show", async () => {
		const { container } = render(renderHeatmap([]));
		await settle();

		expect(layers(container)).toHaveLength(0);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("updates the existing layer when the projects change", async () => {
		const { container, rerender } = render(renderHeatmap([project]));
		await settle();
		drawCalls.length = 0;

		rerender(renderHeatmap([project, otherProject]));
		await settle();
		// The layer redraws on the next animation frame
		await act(() => vi.advanceTimersByTime(50));

		expect(layers(container)).toHaveLength(1);
		expect(drawCalls).toContain("putImageData");
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("removes the layer when it is hidden", async () => {
		const { container, rerender } = render(renderHeatmap([project]));
		await settle();
		expect(layers(container)).toHaveLength(1);

		rerender(renderHeatmap([project], false));
		await settle();

		expect(layers(container)).toHaveLength(0);
		expect(logger.error).not.toHaveBeenCalled();
	});

	it("removes the layer when the component unmounts", async () => {
		const { container, unmount } = render(renderHeatmap([project]));
		await settle();
		expect(layers(container)).toHaveLength(1);

		unmount();

		expect(layers(container)).toHaveLength(0);
		expect(logger.error).not.toHaveBeenCalled();
	});
});
