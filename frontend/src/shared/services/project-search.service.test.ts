import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
	PROJECT_SEARCH_ENDPOINTS,
	searchProjects,
} from "./project-search.service";
import { apiClient } from "@/shared/services/api/client.service";

vi.mock("@/shared/services/api/client.service", () => ({
	apiClient: {
		get: vi.fn(),
	},
}));

describe("project-search.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("searches the small project search with the term as a query parameter", async () => {
		const results = [
			{
				id: 3,
				title: "Wetland monitoring",
				kind: "science",
				status: "active",
				year: 2024,
				number: 5,
			},
		];
		(apiClient.get as Mock).mockResolvedValue(results);

		const found = await searchProjects("SP-2024-5");

		expect(apiClient.get).toHaveBeenCalledWith("projects/smallsearch", {
			params: { searchTerm: "SP-2024-5" },
		});
		expect(found).toEqual(results);
	});

	it("uses a path relative to the API base URL", () => {
		expect(PROJECT_SEARCH_ENDPOINTS.SMALL_SEARCH).not.toContain("/api/v1/");
		expect(PROJECT_SEARCH_ENDPOINTS.SMALL_SEARCH.startsWith("/")).toBe(false);
	});
});
