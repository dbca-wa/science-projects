/**
 * ProjectPlanTab Page Test
 *
 * Tests user flows, accessibility, and document actions for project plans.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { toast } from "sonner";
import { ProjectPlanTab } from "./ProjectPlanTab";
import type {
	IProgressReport,
	IProjectPlan,
	IRelatedProject,
} from "@/shared/types/document.types";
import type {
	IProjectData,
	IProjectDocuments,
	IProjectMember,
	IProjectSearchResult,
} from "@/shared/types/project.types";

expect.extend(toHaveNoViolations);

const mocks = vi.hoisted(() => ({
	currentUser: { id: 1, is_superuser: true, is_staff: true },
	searchProjects: vi.fn(),
	addRelatedProject: vi.fn(),
	removeRelatedProject: vi.fn(),
	clearLegacyRelatedProjects: vi.fn(),
}));

vi.mock("@/shared/services/project-search.service", () => ({
	searchProjects: mocks.searchProjects,
}));

vi.mock("@/features/projects/services/related-project.service", () => ({
	addRelatedProject: mocks.addRelatedProject,
	removeRelatedProject: mocks.removeRelatedProject,
	clearLegacyRelatedProjects: mocks.clearLegacyRelatedProjects,
}));

vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock dependencies
vi.mock("@/shared/components/documents", () => ({
	DocumentTabLayout: ({
		children,
		document,
		onSetAreas,
		onCreateProgressReport,
	}: {
		children: React.ReactNode;
		document: { status: string };
		onSetAreas?: () => void;
		onCreateProgressReport?: () => void;
	}) => (
		<div
			data-testid="document-tab-layout"
			data-document-status={document.status}
		>
			<button data-testid="set-areas-button" onClick={onSetAreas}>
				Set Areas
			</button>
			<button
				data-testid="create-progress-report-button"
				onClick={onCreateProgressReport}
			>
				Create Progress Report
			</button>
			{children}
		</div>
	),
}));

vi.mock("@/shared/components/editor", () => ({
	InlineSaveEditor: ({
		label,
		initialContent,
		canEdit,
	}: {
		label: string;
		initialContent: string;
		canEdit: boolean;
	}) => (
		<div data-testid={`inline-editor-${label}`}>
			<label htmlFor={`editor-${label}`}>{label}</label>
			<div
				id={`editor-${label}`}
				role="textbox"
				aria-label={label}
				data-can-edit={canEdit}
				dangerouslySetInnerHTML={{ __html: initialContent }}
			/>
		</div>
	),
}));

vi.mock("@/shared/components/ProjectSection", () => ({
	ProjectSection: ({ children }: { children: React.ReactNode }) => (
		<section data-testid="project-section">{children}</section>
	),
}));

vi.mock("@/features/projects/components/SetAreasModal", () => ({
	SetAreasModal: ({
		isOpen,
		onClose,
	}: {
		isOpen: boolean;
		onClose: () => void;
	}) =>
		isOpen ? (
			<div role="dialog" aria-label="Set Areas">
				<h2>Set Areas Modal</h2>
				<button onClick={onClose}>Close</button>
			</div>
		) : null,
}));

vi.mock(
	"@/features/projects/components/modals/CreateProgressReportModal",
	() => ({
		CreateProgressReportModal: ({
			isOpen,
			onClose,
		}: {
			isOpen: boolean;
			onClose: () => void;
		}) =>
			isOpen ? (
				<div role="dialog" aria-label="Create Progress Report">
					<h2>Create Progress Report Modal</h2>
					<button onClick={onClose}>Close</button>
				</div>
			) : null,
	})
);

vi.mock("@/features/projects/hooks/useGetProgressReportAvailableYears", () => ({
	useGetProgressReportAvailableYears: vi.fn(() => ({
		data: [
			{ pk: 1, year: 2024 },
			{ pk: 2, year: 2023 },
		],
		isLoading: false,
	})),
}));

vi.mock("@/features/auth", () => ({
	useCurrentUser: () => ({ data: mocks.currentUser }),
}));

vi.mock("@/features/projects/components/comments", () => ({
	CommentSection: () => <div data-testid="comment-section" />,
}));

vi.mock("@/features/projects/components/MethodologyImage", () => ({
	MethodologyImage: () => <div data-testid="methodology-image" />,
}));

vi.mock("@/features/projects/components/ProjectPlanEndorsements", () => ({
	ProjectPlanEndorsements: () => (
		<div data-testid="project-plan-endorsements" />
	),
}));

// Test data
const mockProject: IProjectData = {
	id: 1,
	title: "Test Project",
	status: "active",
	year: 2026,
	kind: "science",
	description: "Test description",
	tagline: "Test tagline",
	image: null,
	keywords: "test",
	number: 1,
	tag: "SP-2026-001",
	start_date: new Date("2026-01-01"),
	end_date: new Date("2026-12-31"),
	business_area: {
		id: 1,
		name: "Test Business Area",
		slug: "test-ba",
		leader: 1,
		focus: "Test",
		introduction: "Test",
		image: null,
		is_active: true,
	},
	deletion_requested: false,
	deletion_request_id: null,
	created_at: new Date("2026-01-01"),
	updated_at: new Date("2026-01-01"),
	areas: [],
} as IProjectData;

const mockProjectPlan: IProjectPlan = {
	id: 1,
	document: {
		id: 1,
		project: mockProject,
		kind: "project_plan",
		status: "approved",
		created_year: 2026,
		creator: 1,
		modifier: 1,
		project_lead_approval_granted: false,
		business_area_lead_approval_granted: false,
		directorate_approval_granted: false,
		pdf_generation_in_progress: false,
		pdf: { file: "" },
		created_at: new Date("2026-01-01T00:00:00Z"),
		updated_at: new Date("2026-01-01T00:00:00Z"),
	},
	background: "<p>Test background</p>",
	aims: "<p>Test aims</p>",
	outcome: "<p>Test outcome</p>",
	knowledge_transfer: "<p>Test knowledge transfer</p>",
	project_tasks: "<p>Test project tasks</p>",
	listed_references: "<p>Test listed references</p>",
	methodology: "<p>Test methodology</p>",
	methodology_image: null,
	related_projects: "<p>Test related projects</p>",
	operating_budget: "<p>Test operating budget</p>",
	operating_budget_external: "<p>Test operating budget external</p>",
	endorsements: {
		id: 1,
		no_specimens: "<p>Test specimens</p>",
		data_management: "<p>Test data management</p>",
		ae_endorsement_required: false,
		ae_endorsement_provided: false,
		aec_pdf: null,
	},
	related_project_links: [],
	related_project_suggestions: [],
};

// Related projects fixtures
const scriptLink: IRelatedProject = {
	id: 11,
	related_project: {
		id: 50,
		title: "<p>Ellen Brook catchment &amp; nutrient export</p>",
		kind: "science",
		status: "active",
		year: 2022,
		number: 33,
		tag: "SP-2022-33",
		leader: "Jo Citizen",
	},
	status: "linked",
	source: "script",
	match_type: "code",
	matched_text: "SPP 2022-033",
	created_at: "2026-10-29T00:00:00Z",
};

const manualLink: IRelatedProject = {
	id: 12,
	related_project: {
		id: 51,
		title: "Species distribution modelling",
		kind: "science",
		status: "active",
		year: 2021,
		number: 11,
		tag: "SP-2021-11",
		leader: "Alex Person",
	},
	status: "linked",
	source: "manual",
	match_type: "",
	matched_text: "",
	created_at: "2026-10-29T00:00:00Z",
};

const firstSuggestion: IRelatedProject = {
	id: 21,
	related_project: {
		id: 60,
		title: "Pilbara biological survey",
		kind: "science",
		status: "completed",
		year: 2009,
		number: 14,
		tag: "SP-2009-14",
		leader: null,
	},
	status: "suggested",
	source: "script",
	match_type: "title",
	matched_text: "Pilbara Biological Survey",
	created_at: "2026-10-29T00:00:00Z",
};

const secondSuggestion: IRelatedProject = {
	id: 22,
	related_project: {
		id: 61,
		title: "Christmas Island cat eradication",
		kind: "science",
		status: "active",
		year: 2015,
		number: 2,
		tag: "SP-2015-2",
		leader: "Sam Example",
	},
	status: "suggested",
	source: "script",
	match_type: "title",
	matched_text: "Cat eradication on Dirk Hartog Island",
	created_at: "2026-10-29T00:00:00Z",
};

const planWith = (overrides: Partial<IProjectPlan>): IProjectPlan => ({
	...mockProjectPlan,
	...overrides,
});

const searchResult = (
	id: number,
	title: string,
	number: number
): IProjectSearchResult => ({
	id,
	title,
	kind: "science",
	status: "active",
	year: 2024,
	number,
});

// A team member who is not a superuser
const teamMemberUser = { id: 7, is_superuser: false, is_staff: true };
const teamMembers = [{ user: { id: 7 } }] as IProjectMember[];

// Approved plan with a progress report: the plan's text is locked
const lockedDocuments = {
	concept_plan: null,
	project_plan: null,
	progress_reports: [{} as IProgressReport],
	student_reports: [],
	project_closure: null,
} satisfies IProjectDocuments;

function renderWithProviders(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>{ui}</BrowserRouter>
		</QueryClientProvider>
	);
}

describe("ProjectPlanTab", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.currentUser = { id: 1, is_superuser: true, is_staff: true };
	});

	describe("Accessibility", () => {
		it("should have no accessibility violations", async () => {
			const { container } = renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			const results = await axe(container);
			expect(results).toHaveNoViolations();
		});

		it("should have proper heading hierarchy", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Check that sections have accessible labels (InlineSaveEditor provides labels, not headings)
			expect(screen.getByLabelText("Background")).toBeInTheDocument();
			expect(screen.getByLabelText("Aims")).toBeInTheDocument();
			expect(screen.getByLabelText("Expected Outcomes")).toBeInTheDocument();
		});

		it("should have accessible form labels", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// All editors should have labels
			expect(screen.getByLabelText("Background")).toBeInTheDocument();
			expect(screen.getByLabelText("Aims")).toBeInTheDocument();
			expect(screen.getByLabelText("Expected Outcomes")).toBeInTheDocument();
		});
	});

	describe("User Flows", () => {
		it("should display all project plan sections", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// All sections should be present (check by editor test-ids)
			expect(
				screen.getByTestId("inline-editor-Background")
			).toBeInTheDocument();
			expect(screen.getByTestId("inline-editor-Aims")).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Expected Outcomes")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Knowledge Transfer")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Project Tasks")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Listed References")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Methodology")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Number of Voucher Specimens")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Data Management")
			).toBeInTheDocument();
			expect(
				screen.getByRole("region", { name: "Related Science Projects" })
			).toBeInTheDocument();
			expect(
				screen.getByRole("group", { name: "Previously recorded (free text)" })
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-Consolidated Funds")
			).toBeInTheDocument();
			expect(
				screen.getByTestId("inline-editor-External Funds")
			).toBeInTheDocument();
		});

		it("should display content in all sections", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Check content is displayed
			expect(screen.getByTestId("inline-editor-Background")).toHaveTextContent(
				"Test background"
			);
			expect(screen.getByTestId("inline-editor-Aims")).toHaveTextContent(
				"Test aims"
			);
			expect(
				screen.getByTestId("inline-editor-Expected Outcomes")
			).toHaveTextContent("Test outcome");
		});

		it("should show empty state when no project plan", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={null}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			expect(
				screen.getByText(/no project plan available/i)
			).toBeInTheDocument();
		});

		it.skip("should show progress reports notice when they exist", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={true}
				/>
			);

			expect(
				screen.getByText(
					/progress reports are available in the progress reports tab/i
				)
			).toBeInTheDocument();
		});
	});

	describe("Special Actions", () => {
		it.skip("should open Set Areas modal when button clicked", async () => {
			const user = userEvent.setup();

			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Click Set Areas button
			const setAreasButton = screen.getByTestId("set-areas-button");
			await user.click(setAreasButton);

			// Modal should appear
			await waitFor(() => {
				expect(
					screen.getByRole("dialog", { name: "Set Areas" })
				).toBeInTheDocument();
			});
		});

		it("should close Set Areas modal when close button clicked", async () => {
			const user = userEvent.setup();

			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Open modal
			const setAreasButton = screen.getByTestId("set-areas-button");
			await user.click(setAreasButton);

			// Close modal
			const closeButton = screen.getByRole("button", { name: "Close" });
			await user.click(closeButton);

			// Modal should be gone
			await waitFor(() => {
				expect(
					screen.queryByRole("dialog", { name: "Set Areas" })
				).not.toBeInTheDocument();
			});
		});

		it("should open Create Progress Report modal when button clicked", async () => {
			const user = userEvent.setup();

			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Click Create Progress Report button
			const createButton = screen.getByTestId("create-progress-report-button");
			await user.click(createButton);

			// Modal should appear
			await waitFor(() => {
				expect(
					screen.getByRole("dialog", { name: "Create Progress Report" })
				).toBeInTheDocument();
			});
		});

		it("should close Create Progress Report modal when close button clicked", async () => {
			const user = userEvent.setup();

			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// Open modal
			const createButton = screen.getByTestId("create-progress-report-button");
			await user.click(createButton);

			// Close modal
			const closeButton = screen.getByRole("button", { name: "Close" });
			await user.click(closeButton);

			// Modal should be gone
			await waitFor(() => {
				expect(
					screen.queryByRole("dialog", { name: "Create Progress Report" })
				).not.toBeInTheDocument();
			});
		});
	});

	describe("Edit Permissions", () => {
		it("should pass canEdit prop to all editors", () => {
			// Use a non-approved document so rich text editing is not locked
			const editableProjectPlan = {
				...mockProjectPlan,
				document: { ...mockProjectPlan.document, status: "new" as const },
			};
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={editableProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
				/>
			);

			// All editors should have canEdit attribute (use actual labels from implementation)
			const sections = [
				"Background",
				"Aims",
				"Expected Outcomes",
				"Knowledge Transfer",
				"Project Tasks",
				"Listed References",
				"Methodology",
				"Number of Voucher Specimens",
				"Data Management",
				"Consolidated Funds",
				"External Funds",
			];

			sections.forEach((section) => {
				const editor = screen.getByTestId(`inline-editor-${section}`);
				expect(
					editor.querySelector('[data-can-edit="true"]')
				).toBeInTheDocument();
			});

			// The previously recorded related projects text is never an editor
			expect(
				screen.queryByTestId("inline-editor-Previously recorded (free text)")
			).not.toBeInTheDocument();
		});
	});

	describe("Document Actions", () => {
		it("should render DocumentTabLayout with correct props", () => {
			renderWithProviders(
				<ProjectPlanTab
					projectPlan={mockProjectPlan}
					project={mockProject}
					projectId={mockProject.id}
					members={[]}
					hasProgressReports={false}
					userIsCaretakerOfAdmin={true}
				/>
			);

			const layout = screen.getByTestId("document-tab-layout");
			expect(layout).toBeInTheDocument();
			expect(layout).toHaveAttribute("data-document-status", "approved");
		});
	});
});

describe("ProjectPlanTab: Related Science Projects", () => {
	type TabProps = React.ComponentProps<typeof ProjectPlanTab>;

	const renderPlanTab = (
		projectPlan: IProjectPlan,
		props: Partial<TabProps> = {}
	) => {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		});
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={queryClient}>
				<BrowserRouter>{children}</BrowserRouter>
			</QueryClientProvider>
		);
		const tab = (plan: IProjectPlan) => (
			<ProjectPlanTab
				projectPlan={plan}
				project={mockProject}
				projectId={mockProject.id}
				members={[]}
				hasProgressReports={false}
				{...props}
			/>
		);
		const result = render(tab(projectPlan), { wrapper });
		return {
			...result,
			rerenderPlan: (plan: IProjectPlan) => result.rerender(tab(plan)),
		};
	};

	const getSection = () =>
		screen.getByRole("region", { name: "Related Science Projects" });
	const getStatus = () => within(getSection()).getByRole("status");
	const getSearchInput = () =>
		screen.getByRole("combobox", { name: "Add a related project" });

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.currentUser = { id: 1, is_superuser: true, is_staff: true };
		mocks.searchProjects.mockResolvedValue([]);
		mocks.addRelatedProject.mockResolvedValue({});
		mocks.removeRelatedProject.mockResolvedValue(undefined);
	});

	it("lists linked projects with their tag, plain-text title, badges and leader", () => {
		renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		const list = within(getSection()).getByRole("list", {
			name: "Related Science Projects",
		});
		const items = within(list).getAllByRole("listitem");
		expect(items).toHaveLength(2);

		const link = within(items[0]).getByRole("link", { name: /SP-2022-33/ });
		expect(link).toHaveAttribute("href", "/projects/50/overview");
		// Tags removed and entities decoded
		expect(link).toHaveTextContent("Ellen Brook catchment & nutrient export");
		expect(within(items[0]).getByText("Science")).toBeInTheDocument();
		expect(within(items[0]).getByText("Active (Approved)")).toBeInTheDocument();
		expect(
			within(items[0]).getByText("Leader: Jo Citizen")
		).toBeInTheDocument();
	});

	it("labels links added by the matching script and explains the label", () => {
		renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		const items = within(getSection()).getAllByRole("listitem");
		const label = within(items[0]).getByRole("button", {
			name: "From previous text",
		});
		expect(label).toHaveAccessibleDescription(
			"Added automatically from the text previously entered for this plan."
		);
		expect(
			within(items[1]).queryByRole("button", { name: "From previous text" })
		).not.toBeInTheDocument();
	});

	it("renders when the plan comes from a backend without related project links", () => {
		const {
			related_project_links: _links,
			related_project_suggestions: _suggestions,
			...olderPlan
		} = mockProjectPlan;
		renderPlanTab(olderPlan as IProjectPlan);

		expect(
			within(getSection()).getByText("No related projects have been added.")
		).toBeInTheDocument();
		expect(getSearchInput()).toBeInTheDocument();
	});

	it("says when no related projects have been added", () => {
		renderPlanTab(planWith({ related_project_links: [] }));

		expect(
			within(getSection()).getByText("No related projects have been added.")
		).toBeInTheDocument();
		expect(within(getSection()).queryByRole("list")).not.toBeInTheDocument();
	});

	it("shows the list without any controls or suggestions to users who cannot edit", () => {
		mocks.currentUser = { id: 99, is_superuser: false, is_staff: true };
		renderPlanTab(
			planWith({
				related_project_links: [scriptLink],
				related_project_suggestions: [firstSuggestion],
			}),
			{ members: teamMembers }
		);

		expect(
			within(getSection()).getByRole("link", { name: /SP-2022-33/ })
		).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^Remove / })
		).not.toBeInTheDocument();
		expect(
			screen.queryByText("Suggested from previous text")
		).not.toBeInTheDocument();
	});

	it("keeps the list editable for team members when the plan is locked", () => {
		mocks.currentUser = teamMemberUser;
		renderPlanTab(
			planWith({
				related_project_links: [scriptLink],
				related_project_suggestions: [firstSuggestion],
			}),
			{ members: teamMembers, all_documents: lockedDocuments }
		);

		// The plan is locked
		expect(
			screen.getByText(/This document is locked to preserve data integrity/)
		).toBeInTheDocument();

		// The related projects list, and clearing the previous text, are not
		expect(
			screen.getByRole("button", { name: "Clear previous text" })
		).toBeInTheDocument();
		expect(getSearchInput()).toBeEnabled();
		expect(
			screen.getByRole("button", {
				name: "Remove SP-2022-33 from related projects",
			})
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Add SP-2009-14 to related projects" })
		).toBeInTheDocument();
	});

	it("shows the previous text below the list, read only, while it has content", () => {
		renderPlanTab(
			planWith({ related_projects: "<p>SPP 2006-003 <em>Forestcheck</em></p>" })
		);

		const panel = within(getSection()).getByRole("group", {
			name: "Previously recorded (free text)",
		});
		expect(panel).toHaveTextContent("SPP 2006-003 Forestcheck");
		expect(panel.querySelector("em")).toHaveTextContent("Forestcheck");
		expect(panel).toHaveTextContent(
			"Add the projects it mentions to the list above, then clear this text."
		);
		// Nothing in it can be edited
		expect(within(panel).queryByRole("textbox")).not.toBeInTheDocument();
		expect(panel.querySelector("[contenteditable]")).toBeNull();
		expect(
			within(panel)
				.getAllByRole("button")
				.map((button) => button.textContent)
		).toEqual(["Clear previous text"]);
	});

	it.each([
		["null", null],
		["an empty string", ""],
		["an empty paragraph", "<p></p>"],
		["a paragraph with a line break", "<p><br></p>"],
		["whitespace", "  <p> </p>\n"],
	])("leaves the previous text out when it is %s", (_label, legacyText) => {
		renderPlanTab(planWith({ related_projects: legacyText }));

		// The section and its new features are still there
		expect(getSection()).toBeInTheDocument();
		expect(getSearchInput()).toBeInTheDocument();
		expect(
			screen.queryByRole("group", { name: "Previously recorded (free text)" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Clear previous text" })
		).not.toBeInTheDocument();
		expect(
			screen.queryByText(
				/This was entered before related projects could be linked/
			)
		).not.toBeInTheDocument();
	});

	it("shows the previous text without the clear button to users who cannot edit", () => {
		mocks.currentUser = { id: 99, is_superuser: false, is_staff: true };
		renderPlanTab(planWith({ related_projects: "<p>SPP 2006-003</p>" }), {
			members: teamMembers,
		});

		const panel = screen.getByRole("group", {
			name: "Previously recorded (free text)",
		});
		expect(panel).toHaveTextContent("SPP 2006-003");
		expect(within(panel).queryByRole("button")).not.toBeInTheDocument();
		expect(panel).toHaveTextContent(
			"This was entered before related projects could be linked."
		);
		expect(panel).not.toHaveTextContent("clear this text");
	});

	it("never offers the plan's own project or projects already in the list", async () => {
		const user = userEvent.setup();
		mocks.searchProjects.mockResolvedValue([
			searchResult(mockProject.id, "Test Project", 1),
			searchResult(scriptLink.related_project.id, "Ellen Brook catchment", 33),
			searchResult(70, "Wetland monitoring", 5),
		]);
		renderPlanTab(planWith({ related_project_links: [scriptLink] }));

		await user.type(getSearchInput(), "monitoring");

		const listbox = await screen.findByRole("listbox", {
			name: "Add a related project",
		});
		const options = within(listbox).getAllByRole("option");
		expect(options).toHaveLength(1);
		expect(options[0]).toHaveTextContent("SP-2024-5");
		expect(options[0]).toHaveTextContent("Wetland monitoring");
		expect(mocks.searchProjects).toHaveBeenCalledWith("monitoring");
	});

	it("adds the chosen project, clears the search and announces it", async () => {
		const user = userEvent.setup();
		mocks.searchProjects.mockResolvedValue([
			searchResult(70, "Wetland monitoring", 5),
		]);
		renderPlanTab(planWith({ related_project_links: [] }));

		const input = getSearchInput();
		await user.type(input, "wetland");
		await user.click(await screen.findByRole("option", { name: /SP-2024-5/ }));

		await waitFor(() =>
			expect(mocks.addRelatedProject).toHaveBeenCalledWith(
				mockProjectPlan.id,
				70
			)
		);
		expect(input).toHaveValue("");
		// Ready for the next search
		expect(input).toHaveFocus();
		await waitFor(() =>
			expect(getStatus()).toHaveTextContent(
				"Added SP-2024-5 to related projects"
			)
		);
	});

	it("adds the highlighted project with the keyboard", async () => {
		const user = userEvent.setup();
		mocks.searchProjects.mockResolvedValue([
			searchResult(70, "Wetland monitoring", 5),
			searchResult(71, "Wetland mapping", 6),
		]);
		renderPlanTab(planWith({ related_project_links: [] }));

		const input = getSearchInput();
		await user.type(input, "wetland");
		await screen.findAllByRole("option");
		await user.keyboard("{ArrowDown}{ArrowDown}");

		const second = screen.getByRole("option", { name: /SP-2024-6/ });
		expect(input).toHaveAttribute("aria-activedescendant", second.id);
		expect(second).toHaveAttribute("aria-selected", "true");

		await user.keyboard("{Enter}");
		await waitFor(() =>
			expect(mocks.addRelatedProject).toHaveBeenCalledWith(
				mockProjectPlan.id,
				71
			)
		);
		expect(input).toHaveFocus();
	});

	it("shows the project as being added until the request finishes", async () => {
		const user = userEvent.setup();
		let finishAdd: (value: object) => void = () => {};
		mocks.addRelatedProject.mockImplementation(
			() => new Promise((resolve) => (finishAdd = resolve))
		);
		mocks.searchProjects.mockResolvedValue([
			searchResult(70, "Wetland monitoring", 5),
			searchResult(71, "Wetland mapping", 6),
		]);
		renderPlanTab(planWith({ related_project_links: [] }));

		await user.type(getSearchInput(), "wetland");
		await user.click(await screen.findByRole("option", { name: /SP-2024-5/ }));
		expect(screen.getByText("Adding SP-2024-5…")).toBeInTheDocument();

		// While the request runs, a new search offers other projects but not it
		await user.type(getSearchInput(), "wet");
		expect(
			await screen.findByRole("option", { name: /SP-2024-6/ })
		).toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /SP-2024-5/ })
		).not.toBeInTheDocument();

		finishAdd({});
		await waitFor(() =>
			expect(screen.queryByText("Adding SP-2024-5…")).not.toBeInTheDocument()
		);
	});

	it("keeps the list unchanged and reports the error when adding fails", async () => {
		const user = userEvent.setup();
		mocks.addRelatedProject.mockRejectedValue({
			message:
				"related_project: This project is already in the related projects list.",
			status: 400,
			fieldErrors: {
				related_project: [
					"This project is already in the related projects list.",
				],
			},
		});
		mocks.searchProjects.mockResolvedValue([
			searchResult(70, "Wetland monitoring", 5),
		]);
		renderPlanTab(planWith({ related_project_links: [] }));

		await user.type(getSearchInput(), "wetland");
		await user.click(await screen.findByRole("option", { name: /SP-2024-5/ }));

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"This project is already in the related projects list."
			)
		);
		expect(
			within(getSection()).getByText("No related projects have been added.")
		).toBeInTheDocument();
		expect(getStatus().textContent).toBe("");
	});

	it("removes a project, announces it and moves focus to the next item", async () => {
		const user = userEvent.setup();
		const { rerenderPlan } = renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		await user.click(
			screen.getByRole("button", {
				name: "Remove SP-2022-33 from related projects",
			})
		);

		await waitFor(() =>
			expect(mocks.removeRelatedProject).toHaveBeenCalledWith(
				mockProjectPlan.id,
				scriptLink.id
			)
		);
		const nextRemove = screen.getByRole("button", {
			name: "Remove SP-2021-11 from related projects",
		});
		await waitFor(() => expect(nextRemove).toHaveFocus());
		expect(getStatus()).toHaveTextContent(
			"Removed SP-2022-33 from related projects"
		);
		expect(toast.success).toHaveBeenCalledWith(
			"Removed SP-2022-33 from related projects"
		);

		// The refetched plan no longer has the row; focus stays put
		rerenderPlan(planWith({ related_project_links: [manualLink] }));
		expect(
			screen.queryByRole("link", { name: /SP-2022-33/ })
		).not.toBeInTheDocument();
		expect(nextRemove).toHaveFocus();
	});

	it("moves focus to the previous item after removing the last one", async () => {
		const user = userEvent.setup();
		renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		await user.click(
			screen.getByRole("button", {
				name: "Remove SP-2021-11 from related projects",
			})
		);

		await waitFor(() =>
			expect(
				screen.getByRole("button", {
					name: "Remove SP-2022-33 from related projects",
				})
			).toHaveFocus()
		);
	});

	it("moves focus to the search when the list becomes empty", async () => {
		const user = userEvent.setup();
		const { rerenderPlan } = renderPlanTab(
			planWith({ related_project_links: [manualLink] })
		);

		await user.click(
			screen.getByRole("button", {
				name: "Remove SP-2021-11 from related projects",
			})
		);

		await waitFor(() => expect(getSearchInput()).toHaveFocus());
		rerenderPlan(planWith({ related_project_links: [] }));
		expect(
			within(getSection()).getByText("No related projects have been added.")
		).toBeInTheDocument();
		expect(getSearchInput()).toHaveFocus();
	});

	it("keeps the project and the focus when removing fails", async () => {
		const user = userEvent.setup();
		mocks.removeRelatedProject.mockRejectedValue({
			message:
				"You do not have permission to change this plan's related projects.",
			status: 403,
		});
		renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		const remove = screen.getByRole("button", {
			name: "Remove SP-2022-33 from related projects",
		});
		await user.click(remove);

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"You do not have permission to change this plan's related projects."
			)
		);
		expect(remove).toHaveFocus();
		expect(remove).not.toHaveAttribute("aria-disabled");
		expect(
			screen.getByRole("link", { name: /SP-2022-33/ })
		).toBeInTheDocument();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("marks the remove button as busy while the request runs", async () => {
		const user = userEvent.setup();
		let finishRemove: () => void = () => {};
		mocks.removeRelatedProject.mockImplementation(
			() => new Promise<void>((resolve) => (finishRemove = resolve))
		);
		renderPlanTab(
			planWith({ related_project_links: [scriptLink, manualLink] })
		);

		const remove = screen.getByRole("button", {
			name: "Remove SP-2022-33 from related projects",
		});
		await user.click(remove);
		expect(remove).toHaveAttribute("aria-disabled", "true");
		// Still focused, and a second click does not send another request
		expect(remove).toHaveFocus();
		await user.click(remove);
		expect(mocks.removeRelatedProject).toHaveBeenCalledTimes(1);
		// Other items stay usable
		expect(
			screen.getByRole("button", {
				name: "Remove SP-2021-11 from related projects",
			})
		).not.toHaveAttribute("aria-disabled");

		finishRemove();
		await waitFor(() =>
			expect(getStatus()).toHaveTextContent(
				"Removed SP-2022-33 from related projects"
			)
		);
	});

	it("shows suggestions to editors with the text each one matched", () => {
		renderPlanTab(
			planWith({
				related_project_suggestions: [firstSuggestion, secondSuggestion],
			})
		);

		const suggestions = screen.getByRole("list", {
			name: "Suggested from previous text",
		});
		const items = within(suggestions).getAllByRole("listitem");
		expect(items).toHaveLength(2);
		expect(items[0]).toHaveTextContent("SP-2009-14");
		expect(items[0]).toHaveTextContent("Pilbara biological survey");
		expect(items[0]).toHaveTextContent("Completed and Closed");
		expect(items[0]).toHaveTextContent(
			"Mentioned as “Pilbara Biological Survey”"
		);
		// Suggestions are not part of the list
		expect(
			within(getSection()).getByText("No related projects have been added.")
		).toBeInTheDocument();
	});

	it("accepts a suggestion and moves focus to the next suggestion", async () => {
		const user = userEvent.setup();
		renderPlanTab(
			planWith({
				related_project_suggestions: [firstSuggestion, secondSuggestion],
			})
		);

		await user.click(
			screen.getByRole("button", { name: "Add SP-2009-14 to related projects" })
		);

		await waitFor(() =>
			expect(mocks.addRelatedProject).toHaveBeenCalledWith(
				mockProjectPlan.id,
				firstSuggestion.related_project.id
			)
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", {
					name: "Add SP-2015-2 to related projects",
				})
			).toHaveFocus()
		);
		expect(getStatus()).toHaveTextContent(
			"Added SP-2009-14 to related projects"
		);
	});

	it("dismisses a suggestion and moves focus to the search when none remain", async () => {
		const user = userEvent.setup();
		renderPlanTab(
			planWith({ related_project_suggestions: [secondSuggestion] })
		);

		await user.click(
			screen.getByRole("button", { name: "Dismiss suggestion SP-2015-2" })
		);

		await waitFor(() =>
			expect(mocks.removeRelatedProject).toHaveBeenCalledWith(
				mockProjectPlan.id,
				secondSuggestion.id
			)
		);
		await waitFor(() => expect(getSearchInput()).toHaveFocus());
		expect(getStatus()).toHaveTextContent("Dismissed suggestion SP-2015-2");
		// Dismissing is not a removal from the list
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("announces repeated messages again", async () => {
		const user = userEvent.setup();
		const { rerenderPlan } = renderPlanTab(
			planWith({ related_project_links: [manualLink] })
		);

		await user.click(
			screen.getByRole("button", {
				name: "Remove SP-2021-11 from related projects",
			})
		);
		await waitFor(() =>
			expect(getStatus()).toHaveTextContent(
				"Removed SP-2021-11 from related projects"
			)
		);
		const firstMessage = within(getStatus()).getByText(
			"Removed SP-2021-11 from related projects"
		);

		// Re-added elsewhere, then removed again
		rerenderPlan(planWith({ related_project_links: [manualLink] }));
		await user.click(
			screen.getByRole("button", {
				name: "Remove SP-2021-11 from related projects",
			})
		);
		await waitFor(() =>
			expect(mocks.removeRelatedProject).toHaveBeenCalledTimes(2)
		);
		await waitFor(() => expect(firstMessage).not.toBeInTheDocument());
		expect(getStatus()).toHaveTextContent(
			"Removed SP-2021-11 from related projects"
		);
	});

	describe("Clearing the previous text", () => {
		const legacyPlan = planWith({
			related_projects: "<p>SPP 2006-003 Forestcheck</p>",
			related_project_links: [manualLink],
		});

		const getClearButton = () =>
			screen.getByRole("button", { name: "Clear previous text" });
		const getDialog = () =>
			screen.getByRole("alertdialog", {
				name: "Clear the previously recorded text?",
			});
		const getPanel = () =>
			screen.queryByRole("group", { name: "Previously recorded (free text)" });

		beforeEach(() => {
			mocks.clearLegacyRelatedProjects.mockResolvedValue(undefined);
		});

		it("asks for confirmation before clearing", async () => {
			const user = userEvent.setup();
			renderPlanTab(legacyPlan);

			await user.click(getClearButton());

			const dialog = getDialog();
			expect(dialog).toHaveTextContent(
				"The related projects list is not affected."
			);
			expect(dialog).toHaveTextContent("This cannot be undone.");
			const cancel = within(dialog).getByRole("button", { name: "Cancel" });
			expect(cancel).toHaveFocus();
			expect(cancel).toHaveAccessibleDescription(/This cannot be undone/);
			expect(mocks.clearLegacyRelatedProjects).not.toHaveBeenCalled();
		});

		it("cancelling keeps the text and returns focus to the clear button", async () => {
			const user = userEvent.setup();
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());

			await user.click(
				within(getDialog()).getByRole("button", { name: "Cancel" })
			);

			expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
			expect(getPanel()).toBeInTheDocument();
			await waitFor(() => expect(getClearButton()).toHaveFocus());
			expect(mocks.clearLegacyRelatedProjects).not.toHaveBeenCalled();
		});

		it("Escape closes the dialog like Cancel", async () => {
			const user = userEvent.setup();
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());

			await user.keyboard("{Escape}");

			expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
			await waitFor(() => expect(getClearButton()).toHaveFocus());
			expect(mocks.clearLegacyRelatedProjects).not.toHaveBeenCalled();
		});

		it("clears the text, then the panel goes and focus moves to the search", async () => {
			const user = userEvent.setup();
			const { rerenderPlan } = renderPlanTab(legacyPlan);
			await user.click(getClearButton());

			await user.click(
				within(getDialog()).getByRole("button", { name: "Clear text" })
			);

			await waitFor(() =>
				expect(mocks.clearLegacyRelatedProjects).toHaveBeenCalledWith(
					mockProjectPlan.id
				)
			);
			await waitFor(() =>
				expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
			);
			expect(getSearchInput()).toHaveFocus();
			expect(getStatus()).toHaveTextContent(
				"Cleared the previously recorded text"
			);
			expect(toast.success).toHaveBeenCalledWith(
				"Previously recorded text cleared"
			);

			// The refetched plan has no previous text: the panel goes, the list stays
			rerenderPlan(
				planWith({ related_projects: "", related_project_links: [manualLink] })
			);
			expect(getPanel()).not.toBeInTheDocument();
			expect(
				within(getSection()).getByRole("link", { name: /SP-2021-11/ })
			).toBeInTheDocument();
			expect(getSearchInput()).toHaveFocus();
		});

		it("keeps the dialog open and the text when clearing fails", async () => {
			const user = userEvent.setup();
			mocks.clearLegacyRelatedProjects.mockRejectedValue({
				message:
					"You do not have permission to change this plan's related projects.",
				status: 403,
			});
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());

			const confirm = within(getDialog()).getByRole("button", {
				name: "Clear text",
			});
			await user.click(confirm);

			await waitFor(() =>
				expect(toast.error).toHaveBeenCalledWith(
					"You do not have permission to change this plan's related projects."
				)
			);
			expect(getDialog()).toBeInTheDocument();
			expect(confirm).toHaveFocus();
			expect(confirm).not.toHaveAttribute("aria-disabled");
			expect(getPanel()).toBeInTheDocument();
			expect(toast.success).not.toHaveBeenCalled();
		});

		it("ignores further clicks, Cancel and Escape while clearing", async () => {
			const user = userEvent.setup();
			let finishClear: () => void = () => {};
			mocks.clearLegacyRelatedProjects.mockImplementation(
				() => new Promise<void>((resolve) => (finishClear = resolve))
			);
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());

			await user.click(
				within(getDialog()).getByRole("button", { name: "Clear text" })
			);
			const busy = within(getDialog()).getByRole("button", {
				name: "Clearing…",
			});
			expect(busy).toHaveAttribute("aria-disabled", "true");
			expect(busy).toHaveFocus();

			await user.click(busy);
			await user.click(
				within(getDialog()).getByRole("button", { name: "Cancel" })
			);
			await user.keyboard("{Escape}");
			expect(getDialog()).toBeInTheDocument();
			expect(mocks.clearLegacyRelatedProjects).toHaveBeenCalledTimes(1);

			finishClear();
			await waitFor(() =>
				expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
			);
		});

		it.each([
			["no suggestions", [], null],
			[
				"one suggestion",
				[firstSuggestion],
				"The suggestion found in this text stays until you add or dismiss it.",
			],
			[
				"two suggestions",
				[firstSuggestion, secondSuggestion],
				"The 2 suggestions found in this text stay until you add or dismiss them.",
			],
		])("says what happens to %s", async (_label, suggestions, expected) => {
			const user = userEvent.setup();
			renderPlanTab(
				planWith({
					related_projects: "<p>Pilbara Biological Survey</p>",
					related_project_suggestions: suggestions,
				})
			);

			await user.click(getClearButton());

			if (expected) {
				expect(getDialog()).toHaveTextContent(expected);
			} else {
				expect(getDialog()).not.toHaveTextContent(/suggestion/i);
			}
		});

		it("keeps keyboard focus on the dialog's buttons", async () => {
			const user = userEvent.setup();
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());
			const cancel = within(getDialog()).getByRole("button", {
				name: "Cancel",
			});
			const confirm = within(getDialog()).getByRole("button", {
				name: "Clear text",
			});

			expect(cancel).toHaveFocus();
			await user.tab();
			expect(confirm).toHaveFocus();
			await user.tab();
			expect(cancel).toHaveFocus();
			await user.tab({ shift: true });
			expect(confirm).toHaveFocus();
		});

		it("has no accessibility violations with the dialog open", async () => {
			const user = userEvent.setup();
			renderPlanTab(legacyPlan);
			await user.click(getClearButton());
			getDialog();

			// The dialog is portalled to the body. The page-level landmark rule
			// does not apply: the test renders the tab without the page layout.
			expect(
				await axe(document.body, { rules: { region: { enabled: false } } })
			).toHaveNoViolations();
		});
	});

	describe("Accessibility", () => {
		it("has no violations when editable, with suggestions and search results open", async () => {
			const user = userEvent.setup();
			mocks.searchProjects.mockResolvedValue([
				searchResult(70, "Wetland monitoring", 5),
			]);
			renderPlanTab(
				planWith({
					related_project_links: [scriptLink, manualLink],
					related_project_suggestions: [firstSuggestion],
				})
			);

			await user.type(getSearchInput(), "wetland");
			await screen.findByRole("listbox");
			expect(getSearchInput()).toHaveAttribute("aria-expanded", "true");

			// The results are portalled to the body, so check the whole document.
			// The page-level landmark rule does not apply: the test renders the
			// tab without the app's page layout.
			expect(
				await axe(document.body, { rules: { region: { enabled: false } } })
			).toHaveNoViolations();
		});

		it("has no violations when read-only", async () => {
			mocks.currentUser = { id: 99, is_superuser: false, is_staff: true };
			const { container } = renderPlanTab(
				planWith({
					related_project_links: [scriptLink],
					related_project_suggestions: [firstSuggestion],
				})
			);

			expect(await axe(container)).toHaveNoViolations();
		});

		it("has no violations when empty", async () => {
			const { container } = renderPlanTab(
				planWith({ related_project_links: [], related_projects: null })
			);

			expect(getSearchInput()).toHaveAttribute("aria-expanded", "false");
			expect(await axe(container)).toHaveNoViolations();
		});
	});
});
