/**
 * Types for stored email correspondence records (announcements and new-cycle
 * emails) that can be browsed, previewed, and reused as templates.
 */

export type EmailRecordKind = "announcement" | "new_cycle";

export interface EmailRecipient {
	pk: number;
	name: string;
	email: string;
	group: string;
}

/** Which records to include when listing: official only, test only, or both */
export type EmailRecordTestFilter = "official" | "test" | "all";

export interface EmailRecordListItem {
	id: number;
	kind: EmailRecordKind;
	subject: string;
	initiator_name: string;
	recipient_count: number;
	emails_sent: number;
	recipient_groups: string[];
	is_test: boolean;
	created_at: string;
}

export interface EmailRecordDetail extends EmailRecordListItem {
	body: string;
	group_messages: Record<string, string>;
	recipients: EmailRecipient[];
}

export interface EmailRecordListResponse {
	results: EmailRecordListItem[];
	total_results: number;
	total_pages: number;
	current_page: number;
}
