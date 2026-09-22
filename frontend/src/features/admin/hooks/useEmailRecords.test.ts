/**
 * Tests for the email records hooks.
 *
 * Verifies that the list and detail hooks call the correct backend endpoints
 * with the correct query parameters.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { apiClient } from "@/shared/services/api/client.service";
import { useEmailRecords, useEmailRecordDetail } from "./useEmailRecords";

vi.mock("@/shared/services/api/client.service", () => ({
	apiClient: {
		get: vi.fn(),
		post: vi.fn(),
	},
}));

const createWrapper = () => {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client: qc }, children);
};

describe("useEmailRecords", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(apiClient.get as Mock).mockResolvedValue({
			results: [],
			total_results: 0,
			total_pages: 0,
			current_page: 1,
		});
	});

	it("requests the list endpoint with the page param", async () => {
		renderHook(() => useEmailRecords(2), { wrapper: createWrapper() });

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		expect(apiClient.get).toHaveBeenCalledWith(
			"adminoptions/email-records?page=2"
		);
	});

	it("includes the kind filter when provided", async () => {
		renderHook(() => useEmailRecords(1, "new_cycle"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		expect(apiClient.get).toHaveBeenCalledWith(
			"adminoptions/email-records?page=1&kind=new_cycle"
		);
	});

	it("omits is_test by default (official only)", async () => {
		renderHook(() => useEmailRecords(1), { wrapper: createWrapper() });

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		const url = (apiClient.get as Mock).mock.calls[0][0] as string;
		expect(url).not.toContain("is_test");
	});

	it("sends is_test=true for the test filter", async () => {
		renderHook(() => useEmailRecords(1, undefined, "test"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		expect(apiClient.get).toHaveBeenCalledWith(
			"adminoptions/email-records?page=1&is_test=true"
		);
	});

	it("sends is_test=all for the all filter", async () => {
		renderHook(() => useEmailRecords(1, undefined, "all"), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		expect(apiClient.get).toHaveBeenCalledWith(
			"adminoptions/email-records?page=1&is_test=all"
		);
	});
});

describe("useEmailRecordDetail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(apiClient.get as Mock).mockResolvedValue({ id: 7 });
	});

	it("does not fetch when id is null", async () => {
		renderHook(() => useEmailRecordDetail(null), {
			wrapper: createWrapper(),
		});

		// Give the query a tick; it should remain disabled.
		await new Promise((r) => setTimeout(r, 20));
		expect(apiClient.get).not.toHaveBeenCalled();
	});

	it("fetches the detail endpoint for a given id", async () => {
		renderHook(() => useEmailRecordDetail(7), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
		expect(apiClient.get).toHaveBeenCalledWith("adminoptions/email-records/7");
	});
});
