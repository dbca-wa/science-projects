import type { IBusinessArea, ISimpleLocationData } from "./org.types";
import type { IAffiliation } from "./org.types";
import type { IImageData } from "./media.types";
import type {
	IConceptPlan,
	IProjectPlan,
	IProgressReport,
	IStudentReport,
	IProjectClosure,
} from "./document.types";

// Re-export IImageData for convenience
export type { IImageData };

/**
 * Project Types
 *
 * Type definitions for project-related data structures.
 * These match the backend API structure.
 */

// Project Status
export type ProjectStatus =
	| "new"
	| "pending"
	| "active"
	| "updating"
	| "closure_requested"
	| "closing"
	| "final_update"
	| "completed"
	| "terminated"
	| "suspended";

// Project Kind
export type ProjectKind = "core_function" | "science" | "student" | "external";

/** A project as returned by the small project search (projects/smallsearch) */
export interface IProjectSearchResult {
	id: number;
	/** May contain inline HTML */
	title: string;
	kind: ProjectKind;
	status: ProjectStatus;
	year: number;
	number: number;
}

// Project Roles
export type ProjectRoles =
	| "supervising"
	| "research"
	| "technical"
	| "externalcol"
	| "externalpeer"
	| "academicsuper"
	| "student"
	| "consulted"
	| "group";

// Project Image
export interface ProjectImage {
	id: number;
	file: string;
	old_file: string;
}

// Small User (for project details)
export interface ISmallUser {
	id: number;
	username: string;
}

// Small Project (for nested references)
export interface ISmallProject {
	id: number;
	title: string;
}

// Small Service
export interface ISmallService {
	id?: number;
	name: string;
}

// Main Project Data
export interface IProjectData {
	id: number;
	areas: ISimpleLocationData[];
	kind: ProjectKind;
	title: string;
	status: ProjectStatus;
	description: string;
	tagline: string;
	image: ProjectImage | null;
	keywords: string;
	year: number;
	number: number;
	start_date: Date;
	end_date: Date;
	business_area: IBusinessArea;
	deletion_requested: boolean;
	deletion_request_id: number | null;
	created_at: Date;
	updated_at: Date;
	tag?: string;
	role?: ProjectRoles;
	hidden_from_staff_profiles?: number[];
	status_before_suspend?: ProjectStatus | null;
}

// Base Project Details
export interface IBaseProjectDetails {
	id: number;
	created_at: Date;
	updated_at: Date;
	creator: ISmallUser;
	modifier: ISmallUser;
	data_custodian: ISmallUser | null;
	site_custodian: ISmallUser | null;
	owner: ISmallUser;
	project: ISmallProject;
	service: ISmallService | null;
}

// Student Project Details
export interface IStudentProjectDetails {
	id: number;
	level: string;
	organisation: string;
	project: ISmallProject;
}

// External Project Details
export interface IExternalProjectDetails {
	id: number;
	project: ISmallProject;
	aims: string | null;
	budget: string | null;
	collaboration_with: string | null;
	description: string | null;
}

// Extended Project Details
export interface IExtendedProjectDetails {
	base: IBaseProjectDetails;
	external: IExternalProjectDetails | [];
	student: IStudentProjectDetails | [];
}

// Caretaker Details
export interface ICaretakerDetails {
	id: number;
	display_first_name: string;
	display_last_name: string;
	email: string;
	image?: IImageData;
}

// Project Member User Details
export interface IMemberUserDetails {
	id: number;
	is_staff: boolean;
	is_superuser: boolean;
	is_active: boolean;
	username: string | null;
	display_first_name: string | null;
	display_last_name: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string;
	phone: string | null;
	business_area: string | null | IBusinessArea;
	branch: string | null;
	agency: string | null;
	role: string | null;
	image: IImageData;
	affiliation: IAffiliation;
	about: string | null;
	expertise: string | null;
	date_joined: string | null;
	caretakers?: ICaretakerDetails[];
}

// Project Member
export interface IProjectMember {
	id: number;
	project: number;
	is_leader: boolean;
	user: IMemberUserDetails;
	role: string;
	time_allocation: number;
	position: number;
	short_code: number | null;
	affiliation: IAffiliation;
}

// Project Documents
export interface IProjectDocuments {
	concept_plan: IConceptPlan | null;
	project_plan: IProjectPlan | null;
	progress_reports: IProgressReport[];
	student_reports: IStudentReport[];
	project_closure: IProjectClosure | null;
}

// Project Areas
export interface IProjectAreas {
	created_at: Date;
	updated_at: Date;
	project: number;
	id: number;
	areas: ISimpleLocationData[];
}

// Full Project Details (for detail page)
export interface IFullProjectDetails {
	project: IProjectData;
	details: IExtendedProjectDetails;
	documents: IProjectDocuments;
	members: IProjectMember[] | null;
}
