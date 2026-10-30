import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
	QueryClient,
	QueryClientProvider,
	QueryObserver,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
	useAddRelatedProject,
	useClearLegacyRelatedProjects,
	useRemoveRelatedProject,
} from "./useRelatedProjects";
import {
	addRelatedProject,
	clearLegacyRelatedProjects,
	removeRelatedProject,
} from "@/features/projects/services/related-project.service";
import type { IRelatedProject } from "@/shared/types/document.types";

vi.mock("@/features/projects/services/related-project.service", () => ({
	addRelatedProject: vi.fn(),
	removeRelatedProject: vi.fn(),
	clearLegacyRelatedProjects: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

const PLAN_ID = 3;
const PROJECT_ID = 5;

const row: IRelatedProject = {
	id: 9,
	related_project: {
		id: 42,
		title: "Wetland monitoring",
		kind: "science",
		status: "active",
		year: 2024,
		number: 5,
		tag: "SP-2024-5",
		leader: null,
	},
	status: "linked",
	source: "manual",
	match_type: "",
	matched_text: "",
	created_at: "2026-10-29T00:00:00Z",
};

describe("useRelatedProjects", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
	});

	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	/** Cached queries the hooks should and should not invalidate */
	const seedQueries = () => {
		const keys = {
			planDetail: ["project-plans", "detail", PLAN_ID],
			planList: ["project-plans"],
			projectById: ["projects", "detail", PROJECT_ID],
			projectByString: ["projects", "detail", String(PROJECT_ID)],
			otherProject: ["projects", "detail", 99],
			unrelated: ["users", "detail", PROJECT_ID],
		};
		for (const key of Object.values(keys)) {
			queryClient.setQueryData(key, { seeded: true });
		}
		return keys;
	};

	const isInvalidated = (key: readonly unknown[]) =>
		queryClient.getQueryState(key)?.isInvalidated ?? false;

	describe("useAddRelatedProject", () => {
		it("adds the project and invalidates the plan and project queries", async () => {
			vi.mocked(addRelatedProject).mockResolvedValue(row);
			const keys = seedQueries();
			const { result } = renderHook(
				() => useAddRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await result.current.mutateAsync(42);

			expect(addRelatedProject).toHaveBeenCalledWith(PLAN_ID, 42);
			expect(isInvalidated(keys.planDetail)).toBe(true);
			expect(isInvalidated(keys.planList)).toBe(true);
			expect(isInvalidated(keys.projectById)).toBe(true);
			expect(isInvalidated(keys.projectByString)).toBe(true);
			expect(isInvalidated(keys.otherProject)).toBe(false);
			expect(isInvalidated(keys.unrelated)).toBe(false);
		});

		it("resolves only after the project has been refetched", async () => {
			vi.mocked(addRelatedProject).mockResolvedValue(row);
			let finishRefetch: (value: string) => void = () => {};
			const queryFn = vi
				.fn<() => Promise<string>>()
				.mockResolvedValueOnce("before")
				.mockImplementationOnce(
					() =>
						new Promise<string>((resolve) => {
							finishRefetch = resolve;
						})
				);
			// An active query, as on the project page
			const observer = new QueryObserver(queryClient, {
				queryKey: ["projects", "detail", PROJECT_ID],
				queryFn,
			});
			const unsubscribe = observer.subscribe(() => {});
			await waitFor(() =>
				expect(observer.getCurrentResult().data).toBe("before")
			);

			const { result } = renderHook(
				() => useAddRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);
			let resolved = false;
			const mutation = result.current.mutateAsync(42).then(() => {
				resolved = true;
			});

			await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(resolved).toBe(false);

			finishRefetch("after");
			await mutation;
			expect(resolved).toBe(true);
			expect(queryClient.getQueryData(["projects", "detail", PROJECT_ID])).toBe(
				"after"
			);
			unsubscribe();
		});

		it("shows the API's reason without the field name", async () => {
			const error = {
				message: "related_project: A project plan cannot list its own project.",
				status: 400,
				fieldErrors: {
					related_project: ["A project plan cannot list its own project."],
				},
			};
			vi.mocked(addRelatedProject).mockRejectedValue(error);
			const { result } = renderHook(
				() => useAddRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await expect(result.current.mutateAsync(PROJECT_ID)).rejects.toBe(error);

			expect(toast.error).toHaveBeenCalledWith(
				"A project plan cannot list its own project."
			);
		});

		it("falls back to a general message when the API gives none", async () => {
			vi.mocked(addRelatedProject).mockRejectedValue(new Error(""));
			const { result } = renderHook(
				() => useAddRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await expect(result.current.mutateAsync(42)).rejects.toThrow();

			expect(toast.error).toHaveBeenCalledWith(
				"Could not add the related project"
			);
		});
	});

	describe("useRemoveRelatedProject", () => {
		it("removes the row and invalidates the plan and project queries", async () => {
			vi.mocked(removeRelatedProject).mockResolvedValue(undefined);
			const keys = seedQueries();
			const { result } = renderHook(
				() => useRemoveRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await result.current.mutateAsync(9);

			expect(removeRelatedProject).toHaveBeenCalledWith(PLAN_ID, 9);
			expect(isInvalidated(keys.planDetail)).toBe(true);
			expect(isInvalidated(keys.planList)).toBe(true);
			expect(isInvalidated(keys.projectById)).toBe(true);
			expect(isInvalidated(keys.projectByString)).toBe(true);
			expect(isInvalidated(keys.otherProject)).toBe(false);
			expect(isInvalidated(keys.unrelated)).toBe(false);
		});

		it("shows the API's message when removing fails", async () => {
			const error = {
				message:
					"You do not have permission to change this plan's related projects.",
				status: 403,
			};
			vi.mocked(removeRelatedProject).mockRejectedValue(error);
			const { result } = renderHook(
				() => useRemoveRelatedProject(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await expect(result.current.mutateAsync(9)).rejects.toBe(error);

			expect(toast.error).toHaveBeenCalledWith(
				"You do not have permission to change this plan's related projects."
			);
			expect(toast.success).not.toHaveBeenCalled();
		});
	});

	describe("useClearLegacyRelatedProjects", () => {
		it("clears the text and invalidates the plan and project queries", async () => {
			vi.mocked(clearLegacyRelatedProjects).mockResolvedValue(undefined);
			const keys = seedQueries();
			const { result } = renderHook(
				() => useClearLegacyRelatedProjects(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await result.current.mutateAsync();

			expect(clearLegacyRelatedProjects).toHaveBeenCalledWith(PLAN_ID);
			expect(isInvalidated(keys.planDetail)).toBe(true);
			expect(isInvalidated(keys.planList)).toBe(true);
			expect(isInvalidated(keys.projectById)).toBe(true);
			expect(isInvalidated(keys.projectByString)).toBe(true);
			expect(isInvalidated(keys.otherProject)).toBe(false);
			expect(isInvalidated(keys.unrelated)).toBe(false);
		});

		it("shows the API's message when clearing fails", async () => {
			const error = {
				message:
					"You do not have permission to change this plan's related projects.",
				status: 403,
			};
			vi.mocked(clearLegacyRelatedProjects).mockRejectedValue(error);
			const { result } = renderHook(
				() => useClearLegacyRelatedProjects(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await expect(result.current.mutateAsync()).rejects.toBe(error);

			expect(toast.error).toHaveBeenCalledWith(
				"You do not have permission to change this plan's related projects."
			);
		});

		it("falls back to a general message when the API gives none", async () => {
			vi.mocked(clearLegacyRelatedProjects).mockRejectedValue(new Error(""));
			const { result } = renderHook(
				() => useClearLegacyRelatedProjects(PLAN_ID, PROJECT_ID),
				{ wrapper }
			);

			await expect(result.current.mutateAsync()).rejects.toThrow();

			expect(toast.error).toHaveBeenCalledWith(
				"Could not clear the previously recorded text"
			);
		});
	});
});
