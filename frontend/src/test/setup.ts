import { afterEach, beforeAll, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "jest-axe";
import { JSDOM } from "jsdom";

// Extend vitest matchers with jest-axe
expect.extend(toHaveNoViolations);

// Mock localStorage with actual storage
const storage: Record<string, string> = {};

const localStorageMock = {
	getItem: (key: string) => storage[key] || null,
	setItem: (key: string, value: string) => {
		storage[key] = value;
	},
	removeItem: (key: string) => {
		delete storage[key];
	},
	clear: () => {
		Object.keys(storage).forEach((key) => delete storage[key]);
	},
	get length() {
		return Object.keys(storage).length;
	},
	key: (index: number) => {
		const keys = Object.keys(storage);
		return keys[index] || null;
	},
};

// Use vi.stubGlobal to ensure localStorage is available globally
vi.stubGlobal("localStorage", localStorageMock);

// Mock matchMedia for responsive components
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// Mock ResizeObserver for Radix UI components
global.ResizeObserver = class ResizeObserver {
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
};

// Polyfill requestAnimationFrame / cancelAnimationFrame for jsdom
if (typeof globalThis.requestAnimationFrame === "undefined") {
	globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
		setTimeout(() => callback(Date.now()), 0) as unknown as number;
	globalThis.cancelAnimationFrame = (id: number): void => clearTimeout(id);
}

// Mock getBoundingClientRect for Lexical editor
Element.prototype.getBoundingClientRect = vi.fn(() => ({
	width: 0,
	height: 0,
	top: 0,
	left: 0,
	bottom: 0,
	right: 0,
	x: 0,
	y: 0,
	toJSON: () => ({}),
}));

// Mock Range.prototype.getBoundingClientRect for Lexical selection
if (typeof Range !== "undefined") {
	Range.prototype.getBoundingClientRect = vi.fn(() => ({
		width: 0,
		height: 0,
		top: 0,
		left: 0,
		bottom: 0,
		right: 0,
		x: 0,
		y: 0,
		toJSON: () => ({}),
	}));
}

// Setup JSDOM for tests that need DOM APIs
beforeAll(() => {
	if (typeof window === "undefined") {
		const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
		global.window = jsdom.window as unknown as Window & typeof globalThis;
		global.document = jsdom.window.document;

		// Ensure window.localStorage uses the same mock
		Object.defineProperty(global.window, "localStorage", {
			value: localStorageMock,
			writable: true,
			configurable: true,
		});
	}
});

// Cleanup after each test (important for component tests in future phases)
afterEach(() => {
	cleanup();
	// Clear localStorage between tests
	if (typeof localStorage !== "undefined" && localStorage.clear) {
		localStorage.clear();
	}
});

// Custom matchers can be added here in future phases
// Example: expect.extend({ toBeWithinRange: ... })
