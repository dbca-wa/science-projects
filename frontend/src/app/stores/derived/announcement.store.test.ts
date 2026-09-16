/**
 * Tests for AnnouncementStore.applyTemplate.
 *
 * Verifies that reusing a prior email as a template prepopulates the subject
 * and body correctly (single vs per-group) and never sets recipients.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AnnouncementStore } from "./announcement.store";

describe("AnnouncementStore.applyTemplate", () => {
	let store: AnnouncementStore;

	beforeEach(() => {
		store = new AnnouncementStore();
	});

	it("sets subject and single body when no group messages", () => {
		store.applyTemplate("SPMS: Reused", "<p>Reused body</p>");

		expect(store.state.subject).toBe("SPMS: Reused");
		expect(store.state.perGroupEnabled).toBe(false);
		expect(store.state.customMessage).toBe("<p>Reused body</p>");
	});

	it("enables per-group and sets group messages when provided", () => {
		store.applyTemplate("SPMS: Grouped", "", {
			ba_leads: "<p>BA</p>",
			project_leads: "<p>PL</p>",
		});

		expect(store.state.subject).toBe("SPMS: Grouped");
		expect(store.state.perGroupEnabled).toBe(true);
		expect(store.state.customMessages.ba_leads).toBe("<p>BA</p>");
		expect(store.state.customMessages.project_leads).toBe("<p>PL</p>");
		expect(store.state.customMessages.team_members).toBe("");
		expect(store.state.customMessage).toBe("");
	});

	it("treats empty group messages as a single-body template", () => {
		store.applyTemplate("SPMS: Empty groups", "<p>Body</p>", {
			ba_leads: "",
			project_leads: "   ",
		});

		expect(store.state.perGroupEnabled).toBe(false);
		expect(store.state.customMessage).toBe("<p>Body</p>");
	});

	it("never sets recipient groups or excluded users", () => {
		store.applyTemplate("SPMS: No recipients", "<p>Body</p>", {
			ba_leads: "<p>BA</p>",
		});

		expect(store.state.sendBaLeads).toBe(false);
		expect(store.state.sendProjectLeads).toBe(false);
		expect(store.state.sendTeamMembers).toBe(false);
		expect(store.state.excludedUserIds).toEqual([]);
	});
});
