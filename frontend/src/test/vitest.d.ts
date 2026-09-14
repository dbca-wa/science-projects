import "vitest";
import type { AxeResults } from "axe-core";

// jest-dom v7 splits its matcher augmentation by test runner. The "/vitest"
// subpath augments vitest's Assertion interface with the DOM matchers; it is
// activated at runtime by the import in src/test/setup.ts. Referencing the
// type here ensures tsc sees the augmentation across all test files.
import "@testing-library/jest-dom/vitest";

// @types/jest-axe only augments jest, not vitest, so wire toHaveNoViolations
// into vitest's Assertion interface manually.
declare module "vitest" {
	interface Assertion<T = unknown> {
		toHaveNoViolations(results?: Partial<AxeResults>): T;
	}
	interface AsymmetricMatchersContaining {
		toHaveNoViolations(results?: Partial<AxeResults>): void;
	}
}
