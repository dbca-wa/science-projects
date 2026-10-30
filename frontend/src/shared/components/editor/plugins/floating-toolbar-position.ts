/**
 * Placement of the floating formatting toolbar within its editor.
 *
 * The editor sits inside boxes that clip their contents (overflow hidden), so
 * the toolbar is kept wholly inside the editor container: centred over the
 * selection where there is room, and pushed in from the edges where there is
 * not. All values are pixels relative to the editor container.
 */

export interface FloatingToolbarAnchor {
	/** Top of the first line of the selection */
	selectionTop: number;
	/** Bottom of the last line of the selection */
	selectionBottom: number;
	/** Horizontal centre of the selection */
	selectionCentre: number;
	containerWidth: number;
	containerHeight: number;
	/** Bottom of the editor's main toolbar, or 0 without one */
	mainToolbarBottom: number;
}

export interface FloatingToolbarSize {
	width: number;
	height: number;
}

/** Space between the selection and the toolbar */
export const FLOATING_TOOLBAR_GAP = 10;
/** Space kept between the toolbar and the container's edges */
export const FLOATING_TOOLBAR_EDGE_MARGIN = 4;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), Math.max(min, max));

export const computeFloatingToolbarPosition = (
	anchor: FloatingToolbarAnchor,
	size: FloatingToolbarSize
): { top: number; left: number } => {
	const margin = FLOATING_TOOLBAR_EDGE_MARGIN;
	const gap = FLOATING_TOOLBAR_GAP;

	// Horizontal: centred on the selection, kept inside the container
	const left = clamp(
		anchor.selectionCentre - size.width / 2,
		margin,
		anchor.containerWidth - size.width - margin
	);

	// Vertical: above the selection when it clears the main toolbar, otherwise
	// below it when that fits, otherwise above it over the main toolbar (the
	// floating toolbar draws on top), so it never covers the selected text
	const above = anchor.selectionTop - gap - size.height;
	const below = anchor.selectionBottom + gap;
	const lowestTop = anchor.containerHeight - size.height - margin;

	let top: number;
	if (above >= anchor.mainToolbarBottom) {
		top = above;
	} else if (below <= lowestTop) {
		top = below;
	} else if (above >= margin) {
		top = above;
	} else {
		top = below;
	}

	return { top: clamp(top, margin, lowestTop), left };
};
