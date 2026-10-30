import { describe, it, expect } from "vitest";
import { calculateRelatedProjectsEditPermission } from "./document-permissions.utils";
import type { IUserMe } from "@/shared/types/user.types";
import type { IProjectMember } from "@/shared/types/project.types";

const makeUser = (id: number, isSuperuser = false) =>
	({ id, is_superuser: isSuperuser }) as IUserMe;

const members = [
	{ user: { id: 10 } },
	{ user: { id: 11 } },
] as IProjectMember[];

describe("calculateRelatedProjectsEditPermission", () => {
	it("denies when there is no current user", () => {
		expect(
			calculateRelatedProjectsEditPermission({ currentUser: null, members })
		).toBe(false);
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: undefined,
				members,
			})
		).toBe(false);
	});

	it("allows superusers, even when not in the team", () => {
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: makeUser(1, true),
				members: [],
			})
		).toBe(true);
	});

	it("allows project team members", () => {
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: makeUser(11),
				members,
			})
		).toBe(true);
	});

	it.each([
		["the business area lead", { isBaLead: true }],
		[
			"a caretaker of the business area leader",
			{ userIsCaretakerOfBaLeader: true },
		],
		[
			"a caretaker of the project leader",
			{ userIsCaretakerOfProjectLeader: true },
		],
		["a caretaker of a superuser", { userIsCaretakerOfAdmin: true }],
	])("allows %s", (_role, flags) => {
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: makeUser(20),
				members,
				...flags,
			})
		).toBe(true);
	});

	it("denies other users", () => {
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: makeUser(20),
				members,
			})
		).toBe(false);
	});

	it("denies other users when the team is not loaded", () => {
		expect(
			calculateRelatedProjectsEditPermission({
				currentUser: makeUser(20),
				members: null,
			})
		).toBe(false);
	});
});
