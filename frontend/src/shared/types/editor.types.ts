/**
 * Rich Text Editor Component Types
 *
 * Type definitions for the Lexical-based rich text editor component.
 */

export type ToolbarMode =
	| "full"
	| "document"
	| "report"
	| "simple"
	| "minimal"
	| "profile"
	| "businessArea"
	| "newCycle"
	| "guide"
	| "projectTitle"
	| "none";

export interface RichTextEditorProps {
	// Content
	value?: string;
	onChange?: (html: string) => void;
	// Receives the editor's own HTML for the loaded content (before the first edit)
	onBaselineChange?: (html: string) => void;
	onSave?: () => void; // Callback for Ctrl+S keyboard shortcut

	// Configuration
	placeholder?: string;
	readOnly?: boolean;
	disabled?: boolean;
	autoFocus?: boolean;
	moveCursorToEnd?: boolean; // Move cursor to end when editor becomes editable (for inline editors)

	// Toolbar
	toolbar?: ToolbarMode;

	// Validation
	wordLimit?: number;
	limitCanBePassed?: boolean; // If true, shows "Aim for max of X words", if false shows "Limit: X words"
	required?: boolean;

	// Styling
	className?: string;
	minHeight?: string;

	// Accessibility
	"aria-label"?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;

	// Floating toolbar
	floatingToolbar?: boolean;

	// Link panel state callback
	onLinkPanelChange?: (isOpen: boolean) => void;
}

export interface RichTextDisplayProps {
	content: string;
	className?: string;
	emptyMessage?: string;
}

export interface ToolbarProps {
	mode: ToolbarMode;
	disabled?: boolean;
	/** Unique key identifying which editor this toolbar belongs to */
	editorKey?: string;
}

export interface FormatButtonProps {
	format: "bold" | "italic" | "underline";
	isActive: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

export interface HeadingSelectProps {
	blockType: "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	onSetBlockType: (
		blockType: "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
	) => void;
	disabled?: boolean;
	disableHeadings?: boolean; // Disable H1/H2/H3 but keep Normal enabled
}

export interface ListButtonProps {
	listType: "bullet" | "number";
	isActive: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

export interface UnifiedListButtonProps {
	isList: boolean;
	listType: "bullet" | "number" | "check" | null;
	onCycleList: () => void;
	disabled?: boolean;
}

export interface UndoRedoButtonsProps {
	canUndo: boolean;
	canRedo: boolean;
	onUndo: () => void;
	onRedo: () => void;
	disabled?: boolean;
}

export interface LinkButtonProps {
	isActive: boolean;
	disabled?: boolean;
}

export interface SubscriptButtonProps {
	isActive: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

export interface SuperscriptButtonProps {
	isActive: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

export interface IndentButtonProps {
	disabled?: boolean;
	onIndent: () => void;
	canIndent: boolean;
}

export interface OutdentButtonProps {
	disabled?: boolean;
	onOutdent: () => void;
	canOutdent: boolean;
}

export interface AlignmentButtonProps {
	disabled?: boolean;
	alignment: "left" | "center" | "right" | "justify";
	onCycleAlignment: () => void;
}

export interface StrikethroughButtonProps {
	isActive: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

export interface TableButtonProps {
	disabled?: boolean;
	onInsertTable: (rows: number, columns: number) => void;
}

export interface ClearEditorButtonProps {
	disabled?: boolean;
	onClear: () => void;
}

export interface WordCountPluginProps {
	wordLimit?: number;
	onWordCountChange?: (count: number) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AutoLinkPluginProps {
	// No props needed for now
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TabIndentationPluginProps {
	// No props needed for now
}

import type {
	AnnualReportSection,
	ConceptPlanSection,
	ProgressReportSection,
	ProjectClosureSection,
	ProjectPlanSection,
	ProjectSection,
	PubliProfileSection,
	StudentReportSection,
} from "./document.types";

export type EditorType =
	| "PublicProfile"
	| "ProjectDetail"
	| "ProjectDocument"
	| "AnnualReport"
	| "Comment"
	| "Guide";
export type EditorSections =
	| "Public Profile"
	| "Annual Report"
	| "Description"
	| "Concept Plan"
	| "Project Plan"
	| "Progress Report"
	| "Student Report"
	| "Project Closure"
	| "Comment";
export type EditorSubsections =
	| "Comment"
	| PubliProfileSection
	| ProjectSection
	| ConceptPlanSection
	| ProjectPlanSection
	| ProgressReportSection
	| StudentReportSection
	| ProjectClosureSection
	| AnnualReportSection;

export interface RGB {
	b: number;
	g: number;
	r: number;
}
export interface HSV {
	h: number;
	s: number;
	v: number;
}
export interface Color {
	hex: string;
	hsv: HSV;
	rgb: RGB;
}
