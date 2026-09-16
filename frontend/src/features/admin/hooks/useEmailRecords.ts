import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/shared/services/api/client.service";
import type {
	EmailRecordDetail,
	EmailRecordKind,
	EmailRecordListResponse,
	EmailRecordTestFilter,
} from "@/features/admin/types/email-record.types";

/**
 * Fetch a paginated list of stored email records.
 *
 * @param page 1-based page number
 * @param kind Optional email kind filter
 * @param testFilter Which records to include:
 *   - "official" (default): exclude test-mode sends
 *   - "test": only test-mode sends
 *   - "all": both
 */
export const useEmailRecords = (
	page: number,
	kind?: EmailRecordKind,
	testFilter: EmailRecordTestFilter = "official"
) => {
	return useQuery({
		queryKey: ["email-records", page, kind ?? "all", testFilter],
		queryFn: () => {
			const params = new URLSearchParams({ page: String(page) });
			if (kind) params.set("kind", kind);
			if (testFilter === "test") params.set("is_test", "true");
			else if (testFilter === "all") params.set("is_test", "all");
			// "official" sends no is_test param — backend excludes test by default.
			return apiClient.get<EmailRecordListResponse>(
				`adminoptions/email-records?${params.toString()}`
			);
		},
		staleTime: 30_000,
	});
};

/** Fetch the full stored content of a single email record */
export const useEmailRecordDetail = (id: number | null) => {
	return useQuery({
		queryKey: ["email-records", "detail", id],
		queryFn: () =>
			apiClient.get<EmailRecordDetail>(`adminoptions/email-records/${id}`),
		enabled: id !== null,
		staleTime: 5 * 60_000,
	});
};
