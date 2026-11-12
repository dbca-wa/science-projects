import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapContainer } from "react-leaflet";
import { MapControls } from "./MapControls";

// Mock the LayerPopover component
vi.mock("./LayerPopover", () => ({
	LayerPopover: () => <div data-testid="layer-popover">Layer Popover</div>,
}));

const announce = vi.hoisted(() => vi.fn());

vi.mock("@/shared/utils/screen-reader.utils", () => ({
	mapAnnouncements: { fullscreenToggle: announce, viewReset: vi.fn() },
}));

// Mock the store context
const mockStore = {
	state: {
		visibleLayerTypes: ["dbcaregion"],
		showLabels: true,
		showColors: true,
		mapFullscreen: false,
	},
	toggleMapFullscreen: vi.fn(),
};

vi.mock("@/app/stores/store-context", () => ({
	useProjectMapStore: () => mockStore,
}));

// Helper component to wrap MapControls in MapContainer
const MapControlsWrapper = () => (
	<MapContainer
		center={[0, 0]}
		zoom={1}
		style={{ height: "400px", width: "400px" }}
		zoomControl={false} // Disable default zoom controls
	>
		<MapControls />
	</MapContainer>
);

describe("MapControls", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock store state
		mockStore.state.mapFullscreen = false;
	});

	it("should render all control buttons", () => {
		render(<MapControlsWrapper />);

		expect(screen.getByLabelText("Enter map fullscreen")).toBeInTheDocument();
		expect(
			screen.getByLabelText("Reset map view to Western Australia")
		).toBeInTheDocument();
		expect(screen.getByTestId("layer-popover")).toBeInTheDocument();
	});

	it("should have proper button titles", () => {
		render(<MapControlsWrapper />);

		expect(screen.getByTitle("Toggle Fullscreen")).toBeInTheDocument();
		expect(screen.getByTitle("Reset")).toBeInTheDocument();
	});

	it("should handle map fullscreen toggle", () => {
		render(<MapControlsWrapper />);

		const fullscreenButton = screen.getByLabelText("Enter map fullscreen");
		fireEvent.click(fullscreenButton);

		expect(mockStore.toggleMapFullscreen).toHaveBeenCalled();
	});

	it("should announce the fullscreen change after a short delay", () => {
		vi.useFakeTimers();
		try {
			render(<MapControlsWrapper />);
			fireEvent.click(screen.getByLabelText("Enter map fullscreen"));
			expect(announce).not.toHaveBeenCalled();

			vi.advanceTimersByTime(100);
			expect(announce).toHaveBeenCalledWith(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("should not announce after the controls are removed", () => {
		vi.useFakeTimers();
		try {
			const { unmount } = render(<MapControlsWrapper />);
			fireEvent.click(screen.getByLabelText("Enter map fullscreen"));
			unmount();

			vi.advanceTimersByTime(1000);
			expect(announce).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it("should show correct fullscreen button state when not in fullscreen", () => {
		mockStore.state.mapFullscreen = false;
		render(<MapControlsWrapper />);

		expect(screen.getByLabelText("Enter map fullscreen")).toBeInTheDocument();
		expect(screen.getByTitle("Toggle Fullscreen")).toBeInTheDocument();
	});

	it("should show correct fullscreen button state when in fullscreen", () => {
		mockStore.state.mapFullscreen = true;
		render(<MapControlsWrapper />);

		expect(screen.getByLabelText("Exit map fullscreen")).toBeInTheDocument();
		expect(screen.getByTitle("Toggle Fullscreen")).toBeInTheDocument();
	});

	it("should render LayerPopover component", () => {
		render(<MapControlsWrapper />);

		expect(screen.getByTestId("layer-popover")).toBeInTheDocument();
	});

	it("should have proper styling classes", () => {
		render(<MapControlsWrapper />);

		// Check that buttons exist with proper styling
		const fullscreenButton = screen.getByLabelText("Enter map fullscreen");
		const resetButton = screen.getByLabelText(
			"Reset map view to Western Australia"
		);

		// Check that buttons have proper styling (flex-1 h-8 for matching layers button width)
		expect(fullscreenButton).toHaveClass("flex-1", "h-8", "p-0");
		expect(resetButton).toHaveClass("flex-1", "h-8", "p-0");
	});

	it("should have proper accessibility attributes", () => {
		render(<MapControlsWrapper />);

		// Check that buttons have proper accessibility attributes
		const fullscreenButton = screen.getByLabelText("Enter map fullscreen");
		const resetButton = screen.getByLabelText(
			"Reset map view to Western Australia"
		);

		expect(fullscreenButton).toHaveAttribute(
			"aria-label",
			"Enter map fullscreen"
		);
		expect(resetButton).toHaveAttribute(
			"aria-label",
			"Reset map view to Western Australia"
		);
	});
});
