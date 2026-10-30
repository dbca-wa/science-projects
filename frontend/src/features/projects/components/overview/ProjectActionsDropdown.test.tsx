/**
 * Bug condition exploration tests for ProjectActionsDropdown reopen logic.
 *
 * These tests encode the EXPECTED (correct) behaviour. They will FAIL on
 * unfixed code because canReopen does not check approvals and
 * isReopenableStatus includes the invalid "closed" status.
 *
 * Validates: Requirements 1.10, 1.11
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { IProjectData } from "@/shared/types/project.types";
import type { IProjectDocuments } from "@/shared/types/project.types";
import type { IUserMe } from "@/shared/types/user.types";

import { ProjectActionsDropdown } from "./ProjectActionsDropdown";

// Mock canEditProject to always return true so the dropdown renders
vi.mock("@/features/projects/utils/permissions", () => ({
	canEditProject: () => true,
}));

/**
 * Build a minimal IProjectData for testing.
 */
function makeProject(overrides: Partial<IProjectData> = {}): IProjectData {
	return {
		id: 1,
		title: "Test Project",
		kind: "science",
		status: "active",
		description: "",
		tagline: "",
		image: null,
		keywords: "",
		year: 2024,
		number: 1,
		start_date: new Date(),
		end_date: new Date(),
		areas: [],
		business_area: {} as IProjectData["business_area"],
		deletion_requested: false,
		deletion_request_id: null,
		created_at: new Date(),
		updated_at: new Date(),
		...overrides,
	} as IProjectData;
}

/**
 * Build a minimal IUserMe for testing.
 */
function makeUser(overrides: Partial<IUserMe> = {}): IUserMe {
	return {
		id: 1,
		display_first_name: "Test",
		display_last_name: "User",
		email: "test@example.com",
		username: "testuser",
		is_superuser: false,
		is_staff: false,
		is_active: true,
		is_aec: false,
		about: "",
		expertise: "",
		phone: "",
		fax: "",
		first_name: "Test",
		last_name: "User",
		title: "",
		role: null,
		date_joined: new Date(),
		caretakers: [],
		caretaking_for: [],
		image: {} as IUserMe["image"],
		agency: {} as IUserMe["agency"],
		branch: {} as IUserMe["branch"],
		business_area: undefined,
		affiliation: {} as IUserMe["affiliation"],
		business_areas_led: [],
		...overrides,
	} as IUserMe;
}

/**
 * Build documents with a closure that has specific approval states.
 */
function makeDocumentsWithClosure(approvals: {
	project_lead: boolean;
	business_area_lead: boolean;
	directorate: boolean;
}): IProjectDocuments {
	return {
		concept_plan: null,
		project_plan: null,
		progress_reports: [],
		student_reports: [],
		project_closure: {
			id: 1,
			document: {
				id: 10,
				created_year: 2024,
				created_at: new Date(),
				creator: 1,
				modifier: 1,
				updated_at: new Date(),
				kind: "projectclosure",
				project: {} as IProjectData,
				status: "approved",
				project_lead_approval_granted: approvals.project_lead,
				business_area_lead_approval_granted: approvals.business_area_lead,
				directorate_approval_granted: approvals.directorate,
				pdf_generation_in_progress: false,
				pdf: { file: "" },
			},
			intended_outcome: null,
			reason: null,
			scientific_outputs: null,
			knowledge_transfer: null,
			data_location: null,
			hardcopy_location: null,
			backup_location: null,
		},
	};
}

/**
 * Helper to open the dropdown and return the user event instance.
 */
async function openDropdown() {
	const user = userEvent.setup();
	const trigger = screen.getByRole("button", { name: /project actions/i });
	await user.click(trigger);
	return user;
}

describe("ProjectActionsDropdown — reopen logic bug conditions", () => {
	const currentUser = makeUser();
	const onReopenProject = vi.fn();

	it("should NOT show Reopen Project when closure approvals are not all granted", async () => {
		// Closure exists but only project lead approval granted (not all three)
		const project = makeProject({ status: "completed" });
		const documents = makeDocumentsWithClosure({
			project_lead: true,
			business_area_lead: false,
			directorate: false,
		});

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onReopenProject={onReopenProject}
			/>
		);

		await openDropdown();

		// Wait for dropdown content to render, then check
		await waitFor(() => {
			// "Reopen Project" should NOT appear because approvals are incomplete
			expect(screen.queryByText("Reopen Project")).not.toBeInTheDocument();
		});
	});

	it("should NOT show Reopen Project when only 2 of 3 approvals are granted", async () => {
		const project = makeProject({ status: "completed" });
		const documents = makeDocumentsWithClosure({
			project_lead: true,
			business_area_lead: true,
			directorate: false,
		});

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onReopenProject={onReopenProject}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.queryByText("Reopen Project")).not.toBeInTheDocument();
		});
	});

	it("should show Reopen Project when all 3 approvals are granted", async () => {
		const project = makeProject({ status: "completed" });
		const documents = makeDocumentsWithClosure({
			project_lead: true,
			business_area_lead: true,
			directorate: true,
		});

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onReopenProject={onReopenProject}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Reopen Project")).toBeInTheDocument();
		});
	});

	it("should NOT treat 'closed' as a valid reopenable status", async () => {
		// "closed" is not a valid backend status — it should not enable reopen
		const project = makeProject({
			status: "closed" as IProjectData["status"],
		});
		const documents = makeDocumentsWithClosure({
			project_lead: true,
			business_area_lead: true,
			directorate: true,
		});

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onReopenProject={onReopenProject}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			// "closed" is not a valid status, so Reopen should NOT appear
			expect(screen.queryByText("Reopen Project")).not.toBeInTheDocument();
		});
	});
});

/**
 * Preservation tests for document-creation eligibility in ProjectActionsDropdown.
 *
 * These tests verify that "Create Concept Plan", "Create Progress Report",
 * and "Create Student Report" eligibility checks continue to work correctly.
 * They must PASS on unfixed code and STILL pass after the bugfix.
 *
 * Validates: Requirements 3.11, 3.12
 */

/**
 * Build documents with a concept plan present.
 */
function makeDocumentsWithConceptPlan(): IProjectDocuments {
	return {
		concept_plan: {
			id: 1,
			document: {
				id: 10,
				created_year: 2024,
				created_at: new Date(),
				creator: 1,
				modifier: 1,
				updated_at: new Date(),
				kind: "concept",
				project: {} as IProjectData,
				status: "approved",
				project_lead_approval_granted: true,
				business_area_lead_approval_granted: true,
				directorate_approval_granted: true,
				pdf_generation_in_progress: false,
				pdf: { file: "" },
			},
			background: null,
			aims: null,
			outcome: null,
			collaborations: null,
			strategic_context: null,
			staff_time_allocation: null,
			budget: null,
		},
		project_plan: null,
		progress_reports: [],
		student_reports: [],
		project_closure: null,
	};
}

/**
 * Build documents with an approved project plan.
 */
function makeDocumentsWithApprovedProjectPlan(): IProjectDocuments {
	return {
		concept_plan: null,
		project_plan: {
			id: 2,
			document: {
				id: 20,
				created_year: 2024,
				created_at: new Date(),
				creator: 1,
				modifier: 1,
				updated_at: new Date(),
				kind: "projectplan",
				project: {} as IProjectData,
				status: "approved",
				project_lead_approval_granted: true,
				business_area_lead_approval_granted: true,
				directorate_approval_granted: true,
				pdf_generation_in_progress: false,
				pdf: { file: "" },
			},
			background: null,
			aims: null,
			outcome: null,
			knowledge_transfer: null,
			listed_references: null,
			operating_budget: null,
			operating_budget_external: null,
			methodology: null,
			methodology_image: null,
			project_tasks: null,
			related_projects: null,
			endorsements: null,
			related_project_links: [],
			related_project_suggestions: [],
		},
		progress_reports: [],
		student_reports: [],
		project_closure: null,
	};
}

/**
 * Build empty documents (no plans, no reports, no closure).
 */
function makeEmptyDocuments(): IProjectDocuments {
	return {
		concept_plan: null,
		project_plan: null,
		progress_reports: [],
		student_reports: [],
		project_closure: null,
	};
}

describe("ProjectActionsDropdown — preservation: concept plan eligibility", () => {
	const currentUser = makeUser();
	const onCreateConceptPlan = vi.fn();

	it("shows Create Concept Plan for science project without existing concept plan", async () => {
		const project = makeProject({ kind: "science", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateConceptPlan={onCreateConceptPlan}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Create Concept Plan")).toBeInTheDocument();
		});
	});

	it("shows Create Concept Plan for core_function project without existing concept plan", async () => {
		const project = makeProject({ kind: "core_function", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateConceptPlan={onCreateConceptPlan}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Create Concept Plan")).toBeInTheDocument();
		});
	});

	it("does NOT show Create Concept Plan when concept plan already exists", async () => {
		const project = makeProject({ kind: "science", status: "active" });
		const documents = makeDocumentsWithConceptPlan();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateConceptPlan={onCreateConceptPlan}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.queryByText("Create Concept Plan")).not.toBeInTheDocument();
		});
	});

	it("does NOT show Create Concept Plan for suspended science project", async () => {
		const project = makeProject({ kind: "science", status: "suspended" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateConceptPlan={onCreateConceptPlan}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.queryByText("Create Concept Plan")).not.toBeInTheDocument();
		});
	});

	it("does NOT show Create Concept Plan for student projects", async () => {
		const project = makeProject({ kind: "student", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateConceptPlan={onCreateConceptPlan}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.queryByText("Create Concept Plan")).not.toBeInTheDocument();
		});
	});
});

describe("ProjectActionsDropdown — preservation: progress report eligibility", () => {
	const currentUser = makeUser();
	const onCreateProgressReport = vi.fn();

	it("shows Create Progress Report (enabled) for science project with approved project plan", async () => {
		const project = makeProject({ kind: "science", status: "active" });
		const documents = makeDocumentsWithApprovedProjectPlan();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateProgressReport={onCreateProgressReport}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			const item = screen.getByText("Create Progress Report");
			expect(item).toBeInTheDocument();
			// The menu item should NOT have the disabled class
			const menuItem = item.closest("[role='menuitem']");
			expect(menuItem).not.toBeNull();
			expect(menuItem?.className).not.toContain("cursor-not-allowed");
		});
	});

	it("shows Create Progress Report (disabled) for science project without approved project plan", async () => {
		const project = makeProject({ kind: "science", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateProgressReport={onCreateProgressReport}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			const item = screen.getByText("Create Progress Report");
			expect(item).toBeInTheDocument();
			// Should have the disabled styling
			const menuItem = item.closest("[role='menuitem']");
			expect(menuItem?.className).toContain("opacity-50");
		});
	});

	it("does NOT show Create Progress Report for student projects", async () => {
		const project = makeProject({ kind: "student", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateProgressReport={onCreateProgressReport}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(
				screen.queryByText("Create Progress Report")
			).not.toBeInTheDocument();
		});
	});
});

describe("ProjectActionsDropdown — preservation: student report eligibility", () => {
	const currentUser = makeUser();
	const onCreateStudentReport = vi.fn();

	it("shows Create Student Report for student projects", async () => {
		const project = makeProject({ kind: "student", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateStudentReport={onCreateStudentReport}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Create Student Report")).toBeInTheDocument();
		});
	});

	it("does NOT show Create Student Report for science projects", async () => {
		const project = makeProject({ kind: "science", status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={currentUser}
				onCreateStudentReport={onCreateStudentReport}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(
				screen.queryByText("Create Student Report")
			).not.toBeInTheDocument();
		});
	});
});

/**
 * Tests for project deletion permission logic.
 *
 * Verifies that BA leads, project leads (within 7-day window),
 * and regular team members see the correct delete/request-deletion
 * options in the dropdown.
 */

describe("ProjectActionsDropdown — deletion permissions", () => {
	const onDeleteProject = vi.fn();
	const onRequestDeletion = vi.fn();

	it("BA lead sees 'Delete Project' in dropdown", async () => {
		const baLeadUser = makeUser({ id: 5, is_superuser: false });
		const project = makeProject({
			status: "active",
			business_area: {
				leader: 5,
				name: "Biodiversity",
				id: 1,
			} as IProjectData["business_area"],
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={baLeadUser}
				isBaLead={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Delete Project")).toBeInTheDocument();
			expect(screen.queryByText("Request Deletion")).not.toBeInTheDocument();
		});
	});

	it("project lead sees 'Delete Project' for a project created 3 days ago", async () => {
		const projectLeadUser = makeUser({ id: 10, is_superuser: false });
		const threeDaysAgo = new Date();
		threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

		const project = makeProject({
			status: "active",
			created_at: threeDaysAgo,
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={projectLeadUser}
				isProjectLead={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Delete Project")).toBeInTheDocument();
			expect(screen.queryByText("Request Deletion")).not.toBeInTheDocument();
		});
	});

	it("project lead sees 'Request Deletion' for a project created 10 days ago", async () => {
		const projectLeadUser = makeUser({ id: 10, is_superuser: false });
		const tenDaysAgo = new Date();
		tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

		const project = makeProject({
			status: "active",
			created_at: tenDaysAgo,
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={projectLeadUser}
				isProjectLead={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Request Deletion")).toBeInTheDocument();
			expect(screen.queryByText("Delete Project")).not.toBeInTheDocument();
		});
	});

	it("regular team member sees 'Request Deletion' regardless of project age", async () => {
		const regularUser = makeUser({ id: 20, is_superuser: false });
		const recentProject = makeProject({
			status: "active",
			created_at: new Date(), // Created today
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={recentProject}
				documents={documents}
				currentUser={regularUser}
				isBaLead={false}
				isProjectLead={false}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Request Deletion")).toBeInTheDocument();
			expect(screen.queryByText("Delete Project")).not.toBeInTheDocument();
		});
	});

	it("superuser always sees 'Delete Project'", async () => {
		const superUser = makeUser({ id: 1, is_superuser: true });
		const oldProject = makeProject({
			status: "active",
			created_at: new Date("2020-01-01"),
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={oldProject}
				documents={documents}
				currentUser={superUser}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Delete Project")).toBeInTheDocument();
			expect(screen.queryByText("Request Deletion")).not.toBeInTheDocument();
		});
	});

	it("caretaker of BA leader sees 'Delete Project'", async () => {
		const caretakerUser = makeUser({ id: 30, is_superuser: false });
		const project = makeProject({ status: "active" });
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={caretakerUser}
				userIsCaretakerOfBaLeader={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Delete Project")).toBeInTheDocument();
			expect(screen.queryByText("Request Deletion")).not.toBeInTheDocument();
		});
	});

	it("caretaker of project leader sees 'Delete Project' for recent project", async () => {
		const caretakerUser = makeUser({ id: 31, is_superuser: false });
		const twoDaysAgo = new Date();
		twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

		const project = makeProject({
			status: "active",
			created_at: twoDaysAgo,
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={caretakerUser}
				userIsCaretakerOfProjectLeader={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Delete Project")).toBeInTheDocument();
			expect(screen.queryByText("Request Deletion")).not.toBeInTheDocument();
		});
	});

	it("caretaker of project leader sees 'Request Deletion' for old project", async () => {
		const caretakerUser = makeUser({ id: 31, is_superuser: false });
		const twentyDaysAgo = new Date();
		twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

		const project = makeProject({
			status: "active",
			created_at: twentyDaysAgo,
		});
		const documents = makeEmptyDocuments();

		render(
			<ProjectActionsDropdown
				project={project}
				documents={documents}
				currentUser={caretakerUser}
				userIsCaretakerOfProjectLeader={true}
				onDeleteProject={onDeleteProject}
				onRequestDeletion={onRequestDeletion}
			/>
		);

		await openDropdown();

		await waitFor(() => {
			expect(screen.getByText("Request Deletion")).toBeInTheDocument();
			expect(screen.queryByText("Delete Project")).not.toBeInTheDocument();
		});
	});
});
