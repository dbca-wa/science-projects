import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommentThread } from "./CommentThread";
import type { IComment } from "@/shared/types/comment.types";

vi.mock("@/features/auth", () => ({
	useCurrentUser: () => ({
		data: {
			id: 1,
			display_first_name: "Test",
			display_last_name: "User",
		},
	}),
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

const renderThread = (comment: IComment) => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<CommentThread
					comment={comment}
					projectId={1}
					project={null}
					canComment
				/>
			</BrowserRouter>
		</QueryClientProvider>
	);
};

describe("CommentThread - Flattened threading", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows a 'Replying to' label for a reply whose parent is another reply", () => {
		const child = createMockComment({
			id: 2,
			text: "<p>Child</p>",
			parent_comment: 1,
		});
		const grandchild = createMockComment({
			id: 3,
			text: "<p>Grandchild</p>",
			parent_comment: 2,
			parent_author_name: "John Doe",
		});
		const root = createMockComment({
			id: 1,
			has_replies: true,
			reply_count: 2,
			replies: [child, grandchild],
		});

		renderThread(root);

		// Expand the thread so reply cards render
		fireEvent.click(screen.getByText(/Show 2 replies/));

		expect(screen.getByText("Replying to John Doe")).toBeInTheDocument();
	});

	it("shows no label for a direct reply to the root", () => {
		const child = createMockComment({
			id: 2,
			text: "<p>Child</p>",
			parent_comment: 1,
			parent_author_name: null,
		});
		const root = createMockComment({
			id: 1,
			has_replies: true,
			reply_count: 1,
			replies: [child],
		});

		renderThread(root);

		fireEvent.click(screen.getByText(/Show 1 reply/));

		expect(screen.queryByText(/Replying to/)).not.toBeInTheDocument();
	});

	it("auto-expands the thread when a new reply arrives", () => {
		const child = createMockComment({
			id: 2,
			text: "<p>Child</p>",
			parent_comment: 1,
		});
		const root = createMockComment({
			id: 1,
			has_replies: true,
			reply_count: 1,
			replies: [child],
		});

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container, rerender } = render(
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>
					<CommentThread
						comment={root}
						projectId={1}
						project={null}
						canComment
					/>
				</BrowserRouter>
			</QueryClientProvider>
		);

		// Collapsed by default: the existing reply card is not rendered yet
		expect(container.querySelector("#comment-2")).not.toBeInTheDocument();

		const newReply = createMockComment({
			id: 3,
			text: "<p>New reply</p>",
			parent_comment: 1,
		});
		const updatedRoot = createMockComment({
			id: 1,
			has_replies: true,
			reply_count: 2,
			replies: [child, newReply],
		});

		act(() => {
			rerender(
				<QueryClientProvider client={queryClient}>
					<BrowserRouter>
						<CommentThread
							comment={updatedRoot}
							projectId={1}
							project={null}
							canComment
						/>
					</BrowserRouter>
				</QueryClientProvider>
			);
		});

		// Thread auto-expands: reply cards are now rendered
		expect(container.querySelector("#comment-2")).toBeInTheDocument();
		expect(container.querySelector("#comment-3")).toBeInTheDocument();
	});
});
