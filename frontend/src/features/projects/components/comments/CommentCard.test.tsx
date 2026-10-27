import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommentCard } from "./CommentCard";
import type { IComment } from "@/shared/types/comment.types";

// Mock auth hook
vi.mock("@/features/auth", () => ({
	useCurrentUser: () => ({
		data: {
			id: 1,
			display_first_name: "Test",
			display_last_name: "User",
		},
	}),
}));

// Mock the reactions hooks. CommentCard fetches reactions via useReactions
// (a separate query), independent of comment.reactions. Tests set
// mockReactions to control what the card sees.
let mockReactions: unknown[] = [];
vi.mock("@/features/projects/hooks/useReactions", () => ({
	useReactions: () => ({ data: mockReactions }),
	useToggleReaction: () => ({ mutate: vi.fn(), isPending: false }),
}));

const createMockComment = (overrides?: Partial<IComment>): IComment => ({
	id: 1,
	user: {
		id: 2,
		display_first_name: "John",
		display_last_name: "Doe",
		email: "john.doe@example.com",
		image: "",
	},
	document: {
		id: 1,
		kind: "conceptplan",
		status: "active",
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	},
	text: "<p>Test comment</p>",
	is_public: true,
	is_removed: false,
	created_at: new Date().toISOString(),
	updated_at: new Date().toISOString(),
	has_replies: false,
	reply_count: 0,
	parent_comment: null,
	replies: [],
	reactions: [],
	mentions: [],
	...overrides,
});

const renderWithProviders = (ui: React.ReactElement) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>{ui}</BrowserRouter>
		</QueryClientProvider>
	);
};

describe("CommentCard - Anchor Links", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render with anchor ID", () => {
		const comment = createMockComment({ id: 123 });
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
			/>
		);

		const card = container.querySelector("#comment-123");
		expect(card).toBeInTheDocument();
	});

	it("should apply highlight styles when isHighlighted is true", () => {
		const comment = createMockComment();
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
				isHighlighted={true}
			/>
		);

		const card = container.querySelector("#comment-1");
		expect(card).toHaveClass("ring-2");
		expect(card).toHaveClass("ring-blue-500");
	});

	it("should not apply highlight styles when isHighlighted is false", () => {
		const comment = createMockComment();
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
				isHighlighted={false}
			/>
		);

		const card = container.querySelector("#comment-1");
		expect(card).not.toHaveClass("ring-2");
	});

	it("should render deleted comment with anchor ID", () => {
		const comment = createMockComment({ id: 456, is_removed: true });
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
			/>
		);

		const card = container.querySelector("#comment-456");
		expect(card).toBeInTheDocument();
		expect(screen.getByText("[Comment deleted]")).toBeInTheDocument();
	});
});

describe("CommentCard - Replies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render the reply button on a reply card", () => {
		const reply = createMockComment({ id: 10, parent_comment: 1 });
		renderWithProviders(
			<CommentCard
				comment={reply}
				projectId={1}
				project={null}
				canComment={true}
				onReply={vi.fn()}
			/>
		);

		expect(screen.getByText("Reply")).toBeInTheDocument();
	});

	it("should render the 'Replying to' label when replyingToName is set", () => {
		const reply = createMockComment({ id: 11, parent_comment: 5 });
		renderWithProviders(
			<CommentCard
				comment={reply}
				projectId={1}
				project={null}
				canComment={true}
				onReply={vi.fn()}
				replyingToName="Jane Smith"
			/>
		);

		expect(screen.getByText("Replying to Jane Smith")).toBeInTheDocument();
	});

	it("should not render a 'Replying to' label when replyingToName is absent", () => {
		const reply = createMockComment({ id: 12, parent_comment: 1 });
		renderWithProviders(
			<CommentCard
				comment={reply}
				projectId={1}
				project={null}
				canComment={true}
				onReply={vi.fn()}
			/>
		);

		expect(screen.queryByText(/Replying to/)).not.toBeInTheDocument();
	});
});

describe("CommentCard - Inline reaction picker overlay", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReactions = [];
	});

	// The inline (wide-card) reaction picker is floated out of flow in the card's
	// top-right corner — the same spot the reaction badge occupies — so the picker
	// and an existing reaction share one end point. These assertions cover the
	// static positioning classes; the hover reveal is a manual/visual check (hover
	// + @container queries are not exercised by jsdom).
	it("floats the inline picker in the top-right corner, matching the reaction badge position", () => {
		const comment = createMockComment({ id: 20 });
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
			/>
		);

		const overlay = container.querySelector(
			'[data-testid="inline-reaction-picker-overlay"]'
		);
		expect(overlay).toBeInTheDocument();
		// Out of flow, pinned to the top-right corner (same as the reaction badge).
		expect(overlay).toHaveClass("absolute");
		expect(overlay).toHaveClass("top-4");
		expect(overlay).toHaveClass("right-4");
	});

	it("does not render the hover picker when the comment already has reactions", () => {
		mockReactions = [
			{
				id: 1,
				reaction: "heart",
				created_at: new Date().toISOString(),
				user: {
					id: 999,
					display_first_name: "Other",
					display_last_name: "User",
					email: "other.user@example.com",
					image: "",
				},
			},
		];
		const comment = createMockComment({ id: 21 });
		const { container } = renderWithProviders(
			<CommentCard
				comment={comment}
				projectId={1}
				project={null}
				canComment={true}
			/>
		);

		// The badge occupies the corner, so the hover picker is suppressed to avoid
		// overlapping it.
		const overlay = container.querySelector(
			'[data-testid="inline-reaction-picker-overlay"]'
		);
		expect(overlay).not.toBeInTheDocument();
	});
});
