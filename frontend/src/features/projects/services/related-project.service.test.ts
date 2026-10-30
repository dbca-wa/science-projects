import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
	addRelatedProject,
	clearLegacyRelatedProjects,
	removeRelatedProject,
} from "./related-project.service";
import { RELATED_PROJECT_ENDPOINTS } from "./related-project.endpoints";
import { apiClient } from "@/shared/services/api/client.service";

vi.mock("@/shared/services/api/client.service", () => ({
	apiClient: {
		post: vi.fn(),
		delete: vi.fn(),
	},
}));

describe("related-project.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("addRelatedProject", () => {
		it("posts the project to the plan's related projects", async () => {
			const row = { id: 9, status: "linked" };
			(apiClient.post as Mock).mockResolvedValue(row);

			const result = await addRelatedProject(7, 42);

			expect(apiClient.post).toHaveBeenCalledWith(
				"documents/projectplans/7/related_projects",
				{ related_project: 42 }
			);
			expect(result).toEqual(row);
		});

		it("passes API errors to the caller", async () => {
			const error = { message: "Not allowed", status: 403 };
			(apiClient.post as Mock).mockRejectedValue(error);

			await expect(addRelatedProject(7, 42)).rejects.toBe(error);
		});
	});

	describe("removeRelatedProject", () => {
		it("deletes the row from the plan's related projects", async () => {
			(apiClient.delete as Mock).mockResolvedValue(undefined);

			await expect(removeRelatedProject(7, 9)).resolves.toBeUndefined();

			expect(apiClient.delete).toHaveBeenCalledWith(
				"documents/projectplans/7/related_projects/9"
			);
		});
	});

	describe("clearLegacyRelatedProjects", () => {
		it("deletes the plan's legacy related projects text", async () => {
			(apiClient.delete as Mock).mockResolvedValue(undefined);

			await expect(clearLegacyRelatedProjects(7)).resolves.toBeUndefined();

			expect(apiClient.delete).toHaveBeenCalledWith(
				"documents/projectplans/7/related_projects/legacy_text"
			);
		});

		it("passes API errors to the caller", async () => {
			const error = { message: "Not allowed", status: 403 };
			(apiClient.delete as Mock).mockRejectedValue(error);

			await expect(clearLegacyRelatedProjects(7)).rejects.toBe(error);
		});
	});

	describe("RELATED_PROJECT_ENDPOINTS", () => {
		it("uses paths relative to the API base URL without trailing slashes", () => {
			const paths = [
				RELATED_PROJECT_ENDPOINTS.ADD(7),
				RELATED_PROJECT_ENDPOINTS.REMOVE(7, 9),
				RELATED_PROJECT_ENDPOINTS.LEGACY_TEXT(7),
			];

			for (const path of paths) {
				expect(path).not.toContain("/api/v1/");
				expect(path.startsWith("/")).toBe(false);
				expect(path.endsWith("/")).toBe(false);
			}
		});
	});
});
