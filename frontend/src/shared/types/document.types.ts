// PROJECT DOCUMENTS ============================================================================

import type { IProjectData, IProjectMember } from "./project.types";

interface IAECPDF {
	created_at: Date;
	updated_at: Date;
	creator: number;
	endorsement: number;
	id: number;
	file: string;
}

interface ISmallProj {
	id: number;
	kind: string;
	title: string;
}

interface IEndorsement {
	id: number;
	ae_endorsement_required: boolean;
	ae_endorsement_provided: boolean;
	data_management: string;
	no_specimens: string;
	aec_pdf: IAECPDF | null;
}

export interface IReferencedDoc {
	id: number;
	year?: number;
}

export interface IMidDoc {
	id: number;
	project: ISmallProj;
	kind: string;
	referenced_doc: IReferencedDoc;
}

export interface ISmallUserWithAvatar {
	id: number;
	email: string;
	display_first_name: string;
	display_last_name: string;
	image: string;
}

/** Compact user representation returned with edit exceptions and eligibility. */
export interface IEditExceptionUser {
	id: number;
	display_first_name: string | null;
	display_last_name: string | null;
	name: string;
	email: string;
	image: string | null;
}

/** A time-limited grant allowing a user to edit a locked document. */
export interface IDocumentEditException {
	id: number;
	document: number;
	user: IEditExceptionUser;
	granted_by: IEditExceptionUser | null;
	expires_at: string;
	created_at: string;
	is_active: boolean;
}

export interface IMainDoc {
	id: number;
	// report?: ISmallReport;
	created_year: number;
	created_at: Date;
	creator: number;
	modifier: number;
	updated_at: Date;
	kind: string;
	project: IProjectData;
	status: string;
	project_lead_approval_granted: boolean;
	business_area_lead_approval_granted: boolean;
	directorate_approval_granted: boolean;
	pdf_generation_in_progress: boolean;
	pdf: IProjectDocPDF;
	for_user?: ISmallUserWithAvatar;
	/** True when the requesting user currently holds an active edit exception. */
	current_user_has_edit_exception?: boolean;
	/** Active exceptions for this document; populated for admins on detail reads. */
	active_edit_exceptions?: IDocumentEditException[] | null;
}

interface IProjectDocPDF {
	file: string;
	document?: number;
	project?: number;
}

export interface IConceptPlan {
	id: number;
	document: IMainDoc;
	background: string | null;
	aims: string | null;
	outcome: string | null;
	collaborations: string | null;
	strategic_context: string | null;
	staff_time_allocation: string | null;
	budget: string | null;
}

export interface IMethodologyImage {
	id: number;
	file: string;
	project_plan: {
		id: number;
	};
	uploader: {
		id: number;
		username: string;
	};
}

export interface IProjectPlan {
	id: number;
	document: IMainDoc;
	background: string | null;
	aims: string | null;
	outcome: string | null;
	knowledge_transfer: string | null;
	listed_references: string | null;
	operating_budget: string | null;
	operating_budget_external: string | null;
	methodology: string | null;
	methodology_image: IMethodologyImage | null;
	project_tasks: string | null;
	related_projects: string | null;
	endorsements: IEndorsement | null;
}

export interface IProgressReport {
	id: number;
	created_at: Date;
	updated_at: Date;
	document: IMainDoc;
	year: number;
	is_final_report: boolean;
	context: string | null;
	aims: string | null;
	progress: string | null;
	implications: string | null;
	future: string | null;
	team_members: IProjectMember[];
}

export interface IStudentReport {
	id: number;
	document: IMainDoc;
	progress_report: string;
	year: number;
}

export interface IProjectClosure {
	id: number;
	document: IMainDoc;
	intended_outcome: string | null;
	reason: string | null;
	scientific_outputs: string | null;
	knowledge_transfer: string | null;
	data_location: string | null;
	hardcopy_location: string | null;
	backup_location: string | null;
}

export interface IProjectDocuments {
	concept_plan: IConceptPlan | null;
	project_plan: IProjectPlan | null;
	progress_reports: IProgressReport[] | [];
	student_reports: IStudentReport[] | [];
	project_closure: IProjectClosure | null;
}

export interface IConceptPlanGenerationData {
	project_id: number;
	document_id: number;
	concept_plan_data_id: number;
	document_tag: string;
	project_title: string;
	project_status: string;
	business_area_name: string;
	project_team: string[];
	project_image: string | null; // Image URL or null if no image
	now: Date;
	project_lead_approval_granted: boolean;
	business_area_lead_approval_granted: boolean;
	directorate_approval_granted: boolean;
	background: string;
	aims: string;
	expected_outcomes: string;
	collaborations: string;
	strategic_context: string;
	staff_time_allocation: string;
	indicative_operating_budget: string;
}

// Editor Sections ============================================================================
export type PubliProfileSection = "About Me" | "Expertise" | "";
export type AnnualReportSection =
	| "dm"
	| "dm_sign"
	| "service_delivery_intro"
	| "research_intro"
	| "student_intro"
	| "publications";
export type ProjectSection =
	"title" | "description" | "tagline" | "externalDescription" | "externalAims";
export type ConceptPlanSection =
	| "background"
	| "aims"
	| "outcome"
	| "collaborations"
	| "strategic_context"
	| "staff_time_allocation"
	| "budget";
export type ProjectPlanSection =
	| "background"
	| "aims"
	| "outcome"
	| "knowledge_transfer"
	| "project_tasks"
	| "listed_references"
	| "data_management"
	| "methodology"
	| "specimens"
	| "operating_budget"
	| "operating_budget_external"
	| "related_projects";
export type ProgressReportSection =
	"context" | "aims" | "progress" | "implications" | "future";
export type StudentReportSection = "progress_report";
export type ProjectClosureSection =
	| "reason"
	| "intended_outcome"
	| "knowledge_transfer"
	| "data_location"
	| "hardcopy_location"
	| "backup_location"
	| "scientific_outputs";

export interface IAnnualReportPDFObject {
	id: number;
	file: string;
	creator: number;
	created_at: string;
	updated_at: string;
	pdf_data: string;
	report: {
		id: number;
		pdf_generation_in_progress: boolean;
		year: number;
	};
}

// PENDING ACTION DOCUMENT (used by dashboard and caretakers) ===================================

/**
 * Project document requiring user action.
 * Represents documents like concept plans, project plans, progress reports, etc.
 * Used by both dashboard and caretakers features for task displays.
 */
export interface IProjectDocument {
	id: number;
	kind:
		| "concept"
		| "projectplan"
		| "progressreport"
		| "studentreport"
		| "projectclosure";
	status: string;
	project: {
		id: number;
		title: string;
		kind: string;
		year: number;
		number: number;
	};
	project_lead_approval_granted: boolean;
	business_area_lead_approval_granted: boolean;
	directorate_approval_granted: boolean;
	for_user?: {
		id: number;
		display_first_name: string;
		display_last_name: string;
		email: string;
		image: string | null;
	};
}
