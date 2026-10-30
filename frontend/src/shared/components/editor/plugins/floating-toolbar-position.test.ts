import { describe, it, expect } from "vitest";
import {
	computeFloatingToolbarPosition,
	FLOATING_TOOLBAR_EDGE_MARGIN as MARGIN,
	FLOATING_TOOLBAR_GAP as GAP,
	type FloatingToolbarAnchor,
} from "./floating-toolbar-position";

const SIZE = { width: 360, height: 36 };

// A 940 x 300 editor whose main toolbar ends 140px down
const anchorAt = (
	overrides: Partial<FloatingToolbarAnchor>
): FloatingToolbarAnchor => ({
	selectionTop: 200,
	selectionBottom: 220,
	selectionCentre: 470,
	containerWidth: 940,
	containerHeight: 300,
	mainToolbarBottom: 140,
	...overrides,
});

const fitsInside = (
	position: { top: number; left: number },
	anchor: FloatingToolbarAnchor,
	size = SIZE
) =>
	position.left >= 0 &&
	position.top >= 0 &&
	position.left + size.width <= anchor.containerWidth &&
	position.top + size.height <= anchor.containerHeight;

describe("computeFloatingToolbarPosition", () => {
	describe("horizontal", () => {
		it("centres the toolbar on the selection when there is room", () => {
			const position = computeFloatingToolbarPosition(anchorAt({}), SIZE);

			expect(position.left).toBe(470 - SIZE.width / 2);
		});

		it("keeps the toolbar inside when the selection is at the left edge", () => {
			// A word at the start of a line, as in the reported bug
			const anchor = anchorAt({ selectionCentre: 110 });
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.left).toBe(MARGIN);
			expect(fitsInside(position, anchor)).toBe(true);
		});

		it("keeps the toolbar inside when the selection is at the right edge", () => {
			const anchor = anchorAt({ selectionCentre: 920 });
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.left).toBe(940 - SIZE.width - MARGIN);
			expect(fitsInside(position, anchor)).toBe(true);
		});

		it("starts at the left margin when the editor is narrower than the toolbar", () => {
			// The toolbar wraps to fit; it must at least start inside
			const anchor = anchorAt({ containerWidth: 300, selectionCentre: 150 });
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.left).toBe(MARGIN);
		});
	});

	describe("vertical", () => {
		it("sits above the selection when it clears the main toolbar", () => {
			const position = computeFloatingToolbarPosition(anchorAt({}), SIZE);

			expect(position.top).toBe(200 - GAP - SIZE.height);
		});

		it("moves below the selection when above would overlap the main toolbar", () => {
			const anchor = anchorAt({ selectionTop: 150, selectionBottom: 170 });
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.top).toBe(170 + GAP);
			expect(fitsInside(position, anchor)).toBe(true);
		});

		it("stays above, over the main toolbar, when below would leave the editor", () => {
			// One short line: neither clear above nor room below
			const anchor = anchorAt({
				selectionTop: 150,
				selectionBottom: 170,
				containerHeight: 200,
			});
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.top).toBe(150 - GAP - SIZE.height);
			expect(fitsInside(position, anchor)).toBe(true);
			// It does not cover the selected text
			expect(position.top + SIZE.height).toBeLessThanOrEqual(150);
		});

		it("never goes above the top of an editor without a main toolbar", () => {
			const anchor = anchorAt({
				selectionTop: 10,
				selectionBottom: 30,
				containerHeight: 60,
				mainToolbarBottom: 0,
			});
			const position = computeFloatingToolbarPosition(anchor, SIZE);

			expect(position.top).toBeGreaterThanOrEqual(MARGIN);
			expect(fitsInside(position, anchor)).toBe(true);
		});
	});
});
