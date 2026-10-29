import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WordCounter } from "./WordCounter";

describe("WordCounter", () => {
	describe("Word counting", () => {
		it("should count words correctly", () => {
			render(<WordCounter content="<p>Hello world</p>" />);
			expect(screen.getByText(/2 words/)).toBeInTheDocument();
		});

		it("should handle empty content", () => {
			render(<WordCounter content="" />);
			expect(screen.getByText(/0 words/)).toBeInTheDocument();
		});

		it("should handle single word", () => {
			render(<WordCounter content="<p>Hello</p>" />);
			expect(screen.getByText(/1 word/)).toBeInTheDocument();
		});

		it("should handle multiple spaces", () => {
			render(<WordCounter content="<p>Hello   world</p>" />);
			expect(screen.getByText(/2 words/)).toBeInTheDocument();
		});

		it("should strip HTML tags", () => {
			render(
				<WordCounter content="<p><strong>Hello</strong> <em>world</em></p>" />
			);
			expect(screen.getByText(/2 words/)).toBeInTheDocument();
		});
	});

	describe("Word limit display", () => {
		it("should display limit when provided", () => {
			render(<WordCounter content="<p>Hello world</p>" limit={10} />);
			expect(screen.getByText(/2 \/ 10 words/)).toBeInTheDocument();
		});

		it("should not display limit when showLimit is false", () => {
			render(
				<WordCounter
					content="<p>Hello world</p>"
					limit={10}
					showLimit={false}
				/>
			);
			expect(screen.getByText(/2 words/)).toBeInTheDocument();
			expect(screen.queryByText(/\/ 10/)).not.toBeInTheDocument();
		});

		it("should show warning when limit exceeded", () => {
			render(<WordCounter content="<p>Hello world test</p>" limit={2} />);
			const text = screen.getByText(/3 \/ 2 words/);
			expect(text).toHaveClass("text-red-600");
		});

		it("should show exceeded amount when over limit", () => {
			render(<WordCounter content="<p>Hello world test</p>" limit={2} />);
			expect(screen.getByText(/\(exceeds limit by 1\)/)).toBeInTheDocument();
		});

		it("should not show exceeded message when within limit", () => {
			render(<WordCounter content="<p>Hello world</p>" limit={10} />);
			expect(screen.queryByText(/exceeds limit/)).not.toBeInTheDocument();
		});

		it("should flag a suggested limit as advice rather than an error", () => {
			render(
				<WordCounter
					content="<p>Hello world test</p>"
					limit={2}
					limitCanBePassed
				/>
			);
			expect(
				screen.getByText(/\(over suggested limit by 1\)/)
			).toBeInTheDocument();
			expect(screen.queryByText(/exceeds limit/)).not.toBeInTheDocument();
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
			expect(screen.getByText(/3 \/ 2 words/)).not.toHaveClass("text-red-600");
		});
	});

	describe("Accessibility", () => {
		it("should have role=status for live region", () => {
			const { container } = render(
				<WordCounter content="<p>Hello world</p>" />
			);
			const status = container.querySelector('[role="status"]');
			expect(status).toBeInTheDocument();
		});

		it("should have aria-live=polite", () => {
			const { container } = render(
				<WordCounter content="<p>Hello world</p>" />
			);
			const status = container.querySelector('[aria-live="polite"]');
			expect(status).toBeInTheDocument();
		});

		it("should have aria-atomic=true", () => {
			const { container } = render(
				<WordCounter content="<p>Hello world</p>" />
			);
			const status = container.querySelector('[aria-atomic="true"]');
			expect(status).toBeInTheDocument();
		});

		it("should have role=alert when limit exceeded", () => {
			render(<WordCounter content="<p>Hello world test</p>" limit={2} />);
			const alert = screen.getByRole("alert");
			expect(alert).toBeInTheDocument();
			expect(alert).toHaveTextContent(/exceeds limit by 1/);
		});
	});
});
