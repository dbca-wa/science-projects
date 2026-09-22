import { useState } from "react";
import { Loader2, Eye, Copy as CopyIcon, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Pagination } from "@/shared/components/Pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	useEmailRecords,
	useEmailRecordDetail,
} from "@/features/admin/hooks/useEmailRecords";
import type {
	EmailRecordKind,
	EmailRecordListItem,
	EmailRecordTestFilter,
} from "@/features/admin/types/email-record.types";
import { EmailRecordPreviewDialog } from "./EmailRecordPreviewDialog";

const PAGE_SIZE = 10;

const KIND_LABEL: Record<EmailRecordKind, string> = {
	announcement: "Announcement",
	new_cycle: "New cycle",
};

const formatDate = (iso: string): string => {
	const date = new Date(iso);
	return date.toLocaleString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

interface EmailHistoryProps {
	/**
	 * Called when the admin chooses to reuse a record as a template. Receives
	 * the record's subject, body, and any per-group messages.
	 */
	onUseAsTemplate: (
		subject: string,
		body: string,
		groupMessages: Record<string, string>
	) => void;
}

/**
 * Browsable history of prior announcement and new-cycle emails.
 * Supports filtering by kind, paginating, previewing full content, and
 * reusing a record as a template for a new announcement.
 */
export const EmailHistory = ({ onUseAsTemplate }: EmailHistoryProps) => {
	const [page, setPage] = useState(1);
	const [kindFilter, setKindFilter] = useState<EmailRecordKind | "all">("all");
	const [testFilter, setTestFilter] =
		useState<EmailRecordTestFilter>("official");
	const [previewId, setPreviewId] = useState<number | null>(null);

	const { data, isLoading, isError } = useEmailRecords(
		page,
		kindFilter === "all" ? undefined : kindFilter,
		testFilter
	);

	const { data: previewDetail, isLoading: previewLoading } =
		useEmailRecordDetail(previewId);

	const handleFilterChange = (value: string) => {
		setKindFilter(value as EmailRecordKind | "all");
		setPage(1);
	};

	const handleTestFilterChange = (value: string) => {
		setTestFilter(value as EmailRecordTestFilter);
		setPage(1);
	};

	const handleUseAsTemplate = (record: EmailRecordListItem) => {
		// The list row lacks body content, so ensure detail is loaded. We open
		// the preview which fetches detail; the dialog exposes the same action.
		setPreviewId(record.id);
	};

	const applyTemplateFromDetail = () => {
		if (!previewDetail) return;
		onUseAsTemplate(
			previewDetail.subject,
			previewDetail.body,
			previewDetail.group_messages
		);
		setPreviewId(null);
		toast.success(
			"Template applied. Select recipients and review before sending."
		);
	};

	const records = data?.results ?? [];
	const totalPages = data?.total_pages ?? 0;
	const totalResults = data?.total_results ?? 0;
	const startIndex = (page - 1) * PAGE_SIZE;
	const endIndex = Math.min(startIndex + records.length, totalResults);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h3 className="text-base font-semibold">Previous emails</h3>
					<p className="text-xs text-muted-foreground">
						A record of announcement and new-cycle emails already sent.
					</p>
				</div>
				<div className="flex gap-2">
					<Select value={testFilter} onValueChange={handleTestFilterChange}>
						<SelectTrigger
							className="w-[150px]"
							aria-label="Filter by official or test emails"
						>
							<SelectValue placeholder="Official" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="official">Official only</SelectItem>
							<SelectItem value="test">Test only</SelectItem>
							<SelectItem value="all">All (incl. test)</SelectItem>
						</SelectContent>
					</Select>
					<Select value={kindFilter} onValueChange={handleFilterChange}>
						<SelectTrigger
							className="w-[160px]"
							aria-label="Filter by email type"
						>
							<SelectValue placeholder="All types" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All types</SelectItem>
							<SelectItem value="announcement">Announcements</SelectItem>
							<SelectItem value="new_cycle">New cycle</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{isLoading && (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			)}

			{isError && (
				<p className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
					Could not load email history. Please try again.
				</p>
			)}

			{!isLoading && !isError && records.length === 0 && (
				<div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
					<Mail className="size-8 text-muted-foreground" aria-hidden="true" />
					<p className="text-sm font-medium">No emails yet</p>
					<p className="text-xs text-muted-foreground">
						Sent announcement and new-cycle emails will appear here.
					</p>
				</div>
			)}

			{!isLoading && !isError && records.length > 0 && (
				<ul className="divide-y rounded-lg border">
					{records.map((record) => (
						<li
							key={record.id}
							className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="min-w-0 space-y-1">
								<div className="flex items-center gap-2">
									<Badge
										variant={
											record.kind === "announcement" ? "default" : "secondary"
										}
									>
										{KIND_LABEL[record.kind]}
									</Badge>
									{record.is_test && (
										<Badge
											variant="outline"
											className="border-amber-500 text-amber-600 dark:text-amber-400"
										>
											Test
										</Badge>
									)}
									<span className="truncate font-medium">{record.subject}</span>
								</div>
								<p className="text-xs text-muted-foreground">
									Sent by {record.initiator_name} on{" "}
									{formatDate(record.created_at)} to {record.recipient_count}{" "}
									recipient{record.recipient_count !== 1 ? "s" : ""}
								</p>
							</div>
							<div className="flex shrink-0 gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => setPreviewId(record.id)}
								>
									<Eye className="size-3.5" aria-hidden="true" />
									Preview
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="gap-1.5"
									onClick={() => handleUseAsTemplate(record)}
								>
									<CopyIcon className="size-3.5" aria-hidden="true" />
									Use as template
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			{totalPages > 1 && (
				<Pagination
					currentPage={page}
					totalPages={totalPages}
					onPageChange={setPage}
					startIndex={startIndex}
					endIndex={endIndex}
					totalItems={totalResults}
					itemLabel="emails"
				/>
			)}

			<EmailRecordPreviewDialog
				open={previewId !== null}
				onOpenChange={(open) => !open && setPreviewId(null)}
				detail={previewDetail}
				isLoading={previewLoading}
				onUseAsTemplate={applyTemplateFromDetail}
			/>
		</div>
	);
};
