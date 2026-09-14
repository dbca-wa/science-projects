import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManageEditExceptionsModal } from "./ManageEditExceptionsModal";
import {
	useDocumentEditExceptions,
	useCreateEditException,
	useRevokeEditException,
	useExtendEditException,
} from "../../hooks/useEditExceptions";

expect.extend(toHaveNoViolations);

vi.mock("../../hooks/useEditExceptions", () => ({
	useDocumentEditExceptions: vi.fn(),
	useCreateEditException: vi.fn(),
	useRevokeEditException: vi.fn(),
	useExtendEditException: vi.fn(),
}));

const eligibleUsers = [
	{
		id: 10,
		display_first_name: "Jane",
		display_last_name: "Lead",
		name: "Jane Lead",
		email: "jane@example.com",
		image: null,
	},
	{
		id: 11,
		display_first_name: "Bob",
		display_last_name: "BaLead",
		name: "Bob BaLead",
		email: "bob@example.com",
		image: null,
	},
];

const activeExceptions = [
	{
		id: 1,
		document: 5,
		user: {
			id: 20,
			display_first_name: "Sam",
			display_last_name: "Member",
			name: "Sam Member",
			email: "sam@example.com",
			image: null,
		},
		granted_by: null,
		expires_at: "2099-01-15T10:00:00Z",
		created_at: "2026-01-10T10:00:00Z",
		is_active: true,
	},
];

const mockCreate = vi.fn();
const mockRevoke = vi.fn();
const mockExtend = vi.fn();

const setup = (
	data: {
		active_exceptions: typeof activeExceptions;
		eligible_users: typeof eligibleUsers;
	} | null,
	isLoading = false
) => {
	vi.mocked(useDocumentEditExceptions).mockReturnValue({
		data: data ?? undefined,
		isLoading,
	} as unknown as ReturnType<typeof useDocumentEditExceptions>);
	vi.mocked(useCreateEditException).mockReturnValue({
		mutate: mockCreate,
		isPending: false,
	} as unknown as ReturnType<typeof useCreateEditException>);
	vi.mocked(useRevokeEditException).mockReturnValue({
		mutate: mockRevoke,
		isPending: false,
	} as unknown as ReturnType<typeof useRevokeEditException>);
	vi.mocked(useExtendEditException).mockReturnValue({
		mutate: mockExtend,
		isPending: false,
	} as unknown as ReturnType<typeof useExtendEditException>);
};

const renderModal = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ManageEditExceptionsModal
				isOpen={true}
				onClose={vi.fn()}
				documentId={5}
				projectId={3}
			/>
		</QueryClientProvider>
	);
};

describe("ManageEditExceptionsModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders active exceptions with a revoke action", () => {
		setup({
			active_exceptions: activeExceptions,
			eligible_users: eligibleUsers,
		});
		renderModal();
		expect(screen.getByText("Sam Member")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
	});

	it("shows an empty state when there are no active exceptions", () => {
		setup({ active_exceptions: [], eligible_users: eligibleUsers });
		renderModal();
		expect(
			screen.getByText(/no one currently has temporary edit access/i)
		).toBeInTheDocument();
	});

	it("offers the grant action", () => {
		setup({ active_exceptions: [], eligible_users: eligibleUsers });
		renderModal();
		expect(
			screen.getByRole("button", { name: /grant access/i })
		).toBeInTheDocument();
	});

	it("has no accessibility violations", async () => {
		setup({
			active_exceptions: activeExceptions,
			eligible_users: eligibleUsers,
		});
		const { container } = renderModal();
		expect(await axe(container)).toHaveNoViolations();
	});
});
