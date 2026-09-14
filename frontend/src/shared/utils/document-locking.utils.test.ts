import { describe, it, expect } from "vitest";
import {
	isDocumentFullyApproved,
	isConceptPlanLocked,
	isProjectPlanLocked,
	isOlderReportLocked,
	isRichTextLocked,
	isProjectInClosedState,
	hasApprovedProjectClosure,
	isReportCreationLocked,
	getEffectiveCanEdit,
	getLockedMessage,
} from "./document-locking.utils";
import type { IMainDoc } from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectDocuments,
} from "@/shared/types/project.types";

// Minimal mock factories
const makeDocument = (overrides: Partial<IMainDoc> = {}): IMainDoc =>
	({
		id: 1,
		status: "new",
		kind: "concept",
		project_lead_approval_granted: false,
		business_area_lead_approval_granted: false,
		directorate_approval_granted: false,
		...overrides,
	}) as IMainDoc;

const makeProject = (overrides: Partial<IProjectData> = {}): IProjectData =>
	({
		id: 1,
		status: "active",
		kind: "science",
		...overrides,
	}) as IProjectData;

describe("document-locking.utils", () => {
	describe("isDocumentFullyApproved", () => {
		it("returns true when status is approved", () => {
			expect(
				isDocumentFullyApproved(makeDocument({ status: "approved" }))
			).toBe(true);
		});

		it("returns false for other statuses", () => {
			expect(isDocumentFullyApproved(makeDocument({ status: "new" }))).toBe(
				false
			);
			expect(
				isDocumentFullyApproved(makeDocument({ status: "inapproval" }))
			).toBe(false);
			expect(
				isDocumentFullyApproved(makeDocument({ status: "revising" }))
			).toBe(false);
		});
	});

	describe("isConceptPlanLocked", () => {
		it("returns true when approved and project plan exists", () => {
			const doc = makeDocument({ status: "approved" });
			const docs = { project_plan: { id: 1 } } as IProjectDocuments;
			expect(isConceptPlanLocked(doc, docs)).toBe(true);
		});

		it("returns false when approved but no project plan", () => {
			const doc = makeDocument({ status: "approved" });
			const docs = {} as IProjectDocuments;
			expect(isConceptPlanLocked(doc, docs)).toBe(false);
		});

		it("returns false when not approved even if project plan exists", () => {
			const doc = makeDocument({ status: "inapproval" });
			const docs = { project_plan: { id: 1 } } as IProjectDocuments;
			expect(isConceptPlanLocked(doc, docs)).toBe(false);
		});
	});

	describe("isProjectPlanLocked", () => {
		it("returns true when approved and progress reports exist", () => {
			const doc = makeDocument({ status: "approved" });
			const docs = {
				progress_reports: [{ id: 1 }],
			} as unknown as IProjectDocuments;
			expect(isProjectPlanLocked(doc, docs)).toBe(true);
		});

		it("returns false when approved but no progress reports", () => {
			const doc = makeDocument({ status: "approved" });
			const docs = { progress_reports: [] } as unknown as IProjectDocuments;
			expect(isProjectPlanLocked(doc, docs)).toBe(false);
		});

		it("returns false when not approved", () => {
			const doc = makeDocument({ status: "new" });
			const docs = {
				progress_reports: [{ id: 1 }],
			} as unknown as IProjectDocuments;
			expect(isProjectPlanLocked(doc, docs)).toBe(false);
		});
	});

	describe("isOlderReportLocked", () => {
		it("returns true when selected year is older and document is approved", () => {
			expect(isOlderReportLocked(2025, [2025, 2026], "approved")).toBe(true);
		});

		it("returns false when selected year is older but document is not approved", () => {
			expect(isOlderReportLocked(2025, [2025, 2026], "new")).toBe(false);
			expect(isOlderReportLocked(2025, [2025, 2026], "inapproval")).toBe(false);
			expect(isOlderReportLocked(2025, [2025, 2026], "revising")).toBe(false);
		});

		it("returns false when selected year is the latest", () => {
			expect(isOlderReportLocked(2026, [2025, 2026], "approved")).toBe(false);
		});

		it("returns false when only one year exists", () => {
			expect(isOlderReportLocked(2026, [2026], "approved")).toBe(false);
		});

		it("returns false when years array is empty", () => {
			expect(isOlderReportLocked(2026, [])).toBe(false);
		});

		it("returns false when no status provided for older year", () => {
			expect(isOlderReportLocked(2025, [2025, 2026])).toBe(false);
		});
	});

	describe("isRichTextLocked", () => {
		it("returns true for approved documents", () => {
			expect(isRichTextLocked(makeDocument({ status: "approved" }))).toBe(true);
		});

		it("returns false for non-approved documents", () => {
			expect(isRichTextLocked(makeDocument({ status: "new" }))).toBe(false);
			expect(isRichTextLocked(makeDocument({ status: "inapproval" }))).toBe(
				false
			);
		});
	});

	describe("isProjectInClosedState", () => {
		it("returns true for completed projects", () => {
			expect(isProjectInClosedState(makeProject({ status: "completed" }))).toBe(
				true
			);
		});

		it("returns true for terminated projects", () => {
			expect(
				isProjectInClosedState(makeProject({ status: "terminated" }))
			).toBe(true);
		});

		it("returns true for closure_requested projects", () => {
			expect(
				isProjectInClosedState(makeProject({ status: "closure_requested" }))
			).toBe(true);
		});

		it("returns false for active projects", () => {
			expect(isProjectInClosedState(makeProject({ status: "active" }))).toBe(
				false
			);
		});

		it("returns false for pending projects", () => {
			expect(isProjectInClosedState(makeProject({ status: "pending" }))).toBe(
				false
			);
		});
	});

	describe("hasApprovedProjectClosure", () => {
		it("returns true when closure document is approved", () => {
			const docs = {
				project_closure: { document: { status: "approved" } },
			} as unknown as IProjectDocuments;
			expect(hasApprovedProjectClosure(docs)).toBe(true);
		});

		it("returns false when closure document is not approved", () => {
			const docs = {
				project_closure: { document: { status: "new" } },
			} as unknown as IProjectDocuments;
			expect(hasApprovedProjectClosure(docs)).toBe(false);
		});

		it("returns false when no closure exists", () => {
			expect(hasApprovedProjectClosure({} as IProjectDocuments)).toBe(false);
			expect(hasApprovedProjectClosure(undefined)).toBe(false);
		});
	});

	describe("isReportCreationLocked", () => {
		it("returns true when project is completed", () => {
			expect(isReportCreationLocked(makeProject({ status: "completed" }))).toBe(
				true
			);
		});

		it("returns true when approved closure exists", () => {
			const docs = {
				project_closure: { document: { status: "approved" } },
			} as unknown as IProjectDocuments;
			expect(
				isReportCreationLocked(makeProject({ status: "active" }), docs)
			).toBe(true);
		});

		it("returns false for active project without closure", () => {
			expect(isReportCreationLocked(makeProject({ status: "active" }))).toBe(
				false
			);
		});
	});

	describe("getEffectiveCanEdit", () => {
		it("returns false when tab is locked", () => {
			const doc = makeDocument({ status: "new" });
			expect(getEffectiveCanEdit(true, doc, true)).toBe(false);
		});

		it("returns false when document is fully approved", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, false)).toBe(false);
		});

		it("returns base permission when not locked and not approved", () => {
			const doc = makeDocument({ status: "new" });
			expect(getEffectiveCanEdit(true, doc, false)).toBe(true);
			expect(getEffectiveCanEdit(false, doc, false)).toBe(false);
		});

		it("returns true for superuser even when tab is locked", () => {
			const doc = makeDocument({ status: "new" });
			expect(getEffectiveCanEdit(true, doc, true, true)).toBe(true);
		});

		it("returns true for superuser even when document is fully approved", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, false, true)).toBe(true);
		});

		it("returns true for superuser even when both tab locked and document approved", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, true, true)).toBe(true);
		});

		it("does not grant superuser bypass when isSuperuser is false", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, false, false)).toBe(false);
		});

		it("does not grant superuser bypass when isSuperuser is undefined", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, false, undefined)).toBe(false);
		});

		it("grants edit access to a user with an active exception on a locked tab", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(false, doc, true, false, true)).toBe(true);
		});

		it("grants edit access with an active exception on a fully approved document", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(false, doc, false, false, true)).toBe(true);
		});

		it("does not grant access without an exception on a locked document", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getEffectiveCanEdit(true, doc, true, false, false)).toBe(false);
		});
	});

	describe("getLockedMessage", () => {
		it("returns undefined when the document is editable", () => {
			const doc = makeDocument({ status: "new" });
			expect(getLockedMessage(doc, false)).toBeUndefined();
		});

		it("returns the approved lock message when fully approved", () => {
			const doc = makeDocument({ status: "approved" });
			expect(getLockedMessage(doc, false)).toContain("fully approved");
		});

		it("returns a temporary-access message when the user has an active exception", () => {
			const doc = makeDocument({ status: "approved" });
			const message = getLockedMessage(doc, true, undefined, true);
			expect(message).toContain("temporary edit access");
		});

		it("includes the expiry date when provided with an active exception", () => {
			const doc = makeDocument({ status: "approved" });
			const message = getLockedMessage(
				doc,
				true,
				undefined,
				true,
				"2099-01-15T10:00:00Z"
			);
			expect(message).toContain("temporary edit access");
			expect(message).toContain("2099");
		});
	});
});
