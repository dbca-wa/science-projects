import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
	getComments,
	createComment,
	updateComment,
	deleteComment,
} from "./comment.service";
import { apiClient } from "@/shared/services/api/client.service";

vi.mock("@/shared/services/api/client.service", () => ({
	apiClient: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	},
}));

describe("comment.service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getComments", () => {
		it("should GET comments for a document", async () => {
			const mockComments = [{ id: 1, text: "Hello" }];
			(apiClient.get as Mock).mockResolvedValue(mockComments);

			const result = await getComments(100);

			expect(apiClient.get).toHaveBeenCalledWith(
				expect.stringContaining("100")
			);
			expect(apiClient.get).toHaveBeenCalledWith(
				expect.stringContaining("top_level_only=true")
			);
			expect(result).toEqual(mockComments);
		});

		it("should throw on failure", async () => {
			(apiClient.get as Mock).mockRejectedValue(new Error("Network error"));

			await expect(getComments(100)).rejects.toThrow("Network error");
		});
	});

	describe("createComment", () => {
		it("should POST comment data", async () => {
			const mockCreated = { id: 2, text: "New comment" };
			(apiClient.post as Mock).mockResolvedValue(mockCreated);

			const result = await createComment({
				document: 100,
				text: "New comment",
			});

			expect(apiClient.post).toHaveBeenCalledWith(expect.any(String), {
				document: 100,
				text: "New comment",
			});
			expect(result).toEqual(mockCreated);
		});
	});

	describe("updateComment", () => {
		it("should PUT updated comment data", async () => {
			const mockUpdated = { id: 1, text: "Updated" };
			(apiClient.put as Mock).mockResolvedValue(mockUpdated);

			const result = await updateComment(1, { text: "Updated" });

			expect(apiClient.put).toHaveBeenCalledWith(expect.stringContaining("1"), {
				text: "Updated",
			});
			expect(result).toEqual(mockUpdated);
		});
	});

	describe("deleteComment", () => {
		it("should DELETE comment by ID", async () => {
			(apiClient.delete as Mock).mockResolvedValue(undefined);

			await deleteComment(1);

			expect(apiClient.delete).toHaveBeenCalledWith(
				expect.stringContaining("1")
			);
		});
	});
});
