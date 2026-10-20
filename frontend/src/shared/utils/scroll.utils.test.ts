import { describe, it, expect, vi, afterEach } from "vitest";
import { scrollMainContentToTop } from "./scroll.utils";

describe("scrollMainContentToTop", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("scrolls the content container when #scroll-container is present", () => {
		document.body.innerHTML = '<div id="scroll-container"></div>';
		const container = document.querySelector("#scroll-container");
		const elementScrollTo = vi.fn();
		Element.prototype.scrollTo =
			elementScrollTo as typeof Element.prototype.scrollTo;
		const windowScrollTo = vi
			.spyOn(window, "scrollTo")
			.mockImplementation(() => {});

		scrollMainContentToTop("smooth");

		expect(container).not.toBeNull();
		expect(elementScrollTo).toHaveBeenCalledWith({
			top: 0,
			left: 0,
			behavior: "smooth",
		});
		expect(windowScrollTo).not.toHaveBeenCalled();
	});

	it("falls back to window scroll when no container matches", () => {
		const windowScrollTo = vi
			.spyOn(window, "scrollTo")
			.mockImplementation(() => {});

		scrollMainContentToTop("auto");

		expect(windowScrollTo).toHaveBeenCalledWith({
			top: 0,
			left: 0,
			behavior: "auto",
		});
	});

	it("defaults to smooth behaviour when no argument is given", () => {
		document.body.innerHTML = '<div id="scroll-container"></div>';
		const elementScrollTo = vi.fn();
		Element.prototype.scrollTo =
			elementScrollTo as typeof Element.prototype.scrollTo;

		scrollMainContentToTop();

		expect(elementScrollTo).toHaveBeenCalledWith({
			top: 0,
			left: 0,
			behavior: "smooth",
		});
	});
});
