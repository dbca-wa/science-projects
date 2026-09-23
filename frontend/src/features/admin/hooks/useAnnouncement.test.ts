/**
 * Tests for announcement email service.
 *
 * Verifies that the announcement API call sends the correct payload
 * shape to the backend endpoint.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { apiClient } from "@/shared/services/api/client.service";

vi.mock("@/shared/services/api/client.service", () => ({
	apiClient: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
	},
}));

describe("Announcement email API payload", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(apiClient.post as Mock).mockResolvedValue({
			emails_sent: 5,
			errors: [],
		});
	});

	it("sends all required fields for announcement", async () => {
		const payload = {
			recipient_groups: ["ba_leads", "project_leads"],
			custom_message: "<p>Important update</p>",
			subject: "SPMS: Important Update",
			division: "bcs",
			excluded_user_ids: [5],
			recipient_user_pks: [1, 2, 3, 4, 5],
		};

		await apiClient.post("adminoptions/send-announcement", payload);

		expect(apiClient.post).toHaveBeenCalledWith(
			"adminoptions/send-announcement",
			expect.objectContaining({
				recipient_groups: ["ba_leads", "project_leads"],
				custom_message: "<p>Important update</p>",
				subject: "SPMS: Important Update",
				division: "bcs",
				recipient_user_pks: [1, 2, 3, 4, 5],
			})
		);
	});

	it("sends per-group custom_messages when provided", async () => {
		const payload = {
			recipient_groups: ["ba_leads", "project_leads", "team_members"],
			custom_messages: {
				ba_leads: "<p>BA lead specific message</p>",
				project_leads: "<p>PL specific message</p>",
				team_members: "<p>Team specific message</p>",
			},
			subject: "SPMS: Announcement",
		};

		await apiClient.post("adminoptions/send-announcement", payload);

		const sentPayload = (apiClient.post as Mock).mock.calls[0][1];
		expect(sentPayload.custom_messages).toEqual({
			ba_leads: "<p>BA lead specific message</p>",
			project_leads: "<p>PL specific message</p>",
			team_members: "<p>Team specific message</p>",
		});
	});

	it("sends recipient_user_pks for explicit recipient targeting", async () => {
		const payload = {
			recipient_groups: ["ba_leads"],
			custom_message: "<p>Test</p>",
			recipient_user_pks: [100, 200, 300],
		};

		await apiClient.post("adminoptions/send-announcement", payload);

		const sentPayload = (apiClient.post as Mock).mock.calls[0][1];
		expect(sentPayload.recipient_user_pks).toEqual([100, 200, 300]);
	});

	it("sends test_recipient_pk for a single test email", async () => {
		(apiClient.post as Mock).mockResolvedValue({ emails_sent: 1, errors: [] });

		const payload = {
			recipient_groups: ["ba_leads", "project_leads"],
			subject: "SPMS: Announcement",
			custom_message: "<p>Test body</p>",
			test_recipient_pk: 42,
		};

		await apiClient.post("adminoptions/send-announcement", payload);

		const sentPayload = (apiClient.post as Mock).mock.calls[0][1];
		expect(sentPayload.test_recipient_pk).toBe(42);
		expect(sentPayload.recipient_groups).toEqual(["ba_leads", "project_leads"]);
	});
});
