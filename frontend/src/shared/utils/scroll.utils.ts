// Utilities for scrolling the main content area to the top

/**
 * Scrolls the main content area back to the top.
 *
 * The app shell uses a fixed outer layout with scrolling delegated to an inner
 * container, so calling window.scrollTo directly is a no-op on most pages. This
 * helper resolves the real scrollable container by querying, in order, the
 * content-layout container (#scroll-container), then any element with
 * overflow-y-auto, then the staff-layout container (overflow-y-scroll). If none
 * of those are present it falls back to scrolling the window so the behaviour
 * stays correct if the shell markup changes.
 */
export const scrollMainContentToTop = (
	behavior: ScrollBehavior = "smooth"
): void => {
	const scrollContainer: Element | null =
		document.querySelector("#scroll-container") ??
		document.querySelector(".overflow-y-auto") ??
		document.querySelector(".overflow-y-scroll");

	if (scrollContainer) {
		scrollContainer.scrollTo({ top: 0, left: 0, behavior });
	} else {
		window.scrollTo({ top: 0, left: 0, behavior });
	}
};
