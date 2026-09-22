import { useState } from "react";
import { Loader2, Copy as CopyIcon } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { RichTextDisplay } from "@/shared/components/editor/RichTextDisplay";
import type { EmailRecordDetail } from "@/features/admin/types/email-record.types";

type GroupKey = "ba_leads" | "project_leads" | "team_members";

const GROUP_LABEL: Record<GroupKey, string> = {
	ba_leads: "Business Area Leads",
	project_leads: "Project Leads",
	team_members: "Team Members",
};

const formatDate = (iso: string): string =>
	new Date(iso).toLocaleString("en-AU", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

interface EmailRecordPreviewDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	detail: EmailRecordDetail | undefined;
	isLoading: boolean;
	onUseAsTemplate: () => void;
}

/**
 * Dialog that previews the full stored content of a prior email record,
 * including metadata, recipients, and body (single or per-group message).
 */
export const EmailRecordPreviewDialog = ({
	open,
	onOpenChange,
	detail,
	isLoading,
	onUseAsTemplate,
}: EmailRecordPreviewDialogProps) => {
	const groupKeys = detail
		? (Object.keys(detail.group_messages).filter(
				(k) => detail.group_messages[k] && detail.group_messages[k].trim()
			) as GroupKey[])
		: [];
	const hasGroupMessages = groupKeys.length > 0;

	// Track the user's explicit group selection alongside the record it belongs
	// to. Deriving the active group during render (rather than in an effect)
	// avoids cascading renders: when the record changes, the previous selection
	// is stale and we fall back to the first available group.
	const [selection, setSelection] = useState<{
		recordId: number;
		group: GroupKey;
	} | null>(null);

	const activeGroup: GroupKey | null = hasGroupMessages
		? selection &&
			selection.recordId === detail?.id &&
			groupKeys.includes(selection.group)
			? selection.group
			: groupKeys[0]
		: null;

	const bodyToShow =
		hasGroupMessages && activeGroup
			? detail?.group_messages[activeGroup]
			: detail?.body;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="pr-6">
						{detail?.subject ?? "Email preview"}
					</DialogTitle>
					<DialogDescription>
						{detail
							? `Sent by ${detail.initiator_name} on ${formatDate(detail.created_at)}`
							: "Loading email content"}
					</DialogDescription>
				</DialogHeader>

				{isLoading || !detail ? (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="space-y-4">
						{/* Metadata */}
						<div className="flex flex-wrap gap-2 text-xs">
							<Badge variant="outline">
								{detail.kind === "announcement" ? "Announcement" : "New cycle"}
							</Badge>
							{detail.is_test && (
								<Badge
									variant="outline"
									className="border-amber-500 text-amber-600 dark:text-amber-400"
								>
									Test
								</Badge>
							)}
							{detail.recipient_groups.map((g) => (
								<Badge key={g} variant="secondary">
									{GROUP_LABEL[g as GroupKey] ?? g}
								</Badge>
							))}
							<Badge variant="outline">
								{detail.recipient_count} recipient
								{detail.recipient_count !== 1 ? "s" : ""}
							</Badge>
						</div>

						{/* Per-group selector */}
						{hasGroupMessages && (
							<div className="flex flex-wrap gap-2">
								{groupKeys.map((g) => (
									<Button
										key={g}
										type="button"
										size="sm"
										variant={activeGroup === g ? "default" : "outline"}
										onClick={() =>
											detail && setSelection({ recordId: detail.id, group: g })
										}
									>
										{GROUP_LABEL[g]}
									</Button>
								))}
							</div>
						)}

						{/* Body */}
						<div className="rounded-lg border bg-muted/30 p-4">
							<RichTextDisplay
								content={bodyToShow ?? ""}
								emptyMessage="No message content was stored for this email."
							/>
						</div>

						{/* Recipients */}
						{detail.recipients.length > 0 && (
							<details className="rounded-lg border p-3">
								<summary className="cursor-pointer text-sm font-medium">
									Recipients ({detail.recipients.length})
								</summary>
								<ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
									{detail.recipients.map((r) => (
										<li key={r.pk}>
											{r.name} &lt;{r.email}&gt;
										</li>
									))}
								</ul>
							</details>
						)}
					</div>
				)}

				<DialogFooter>
					<Button
						type="button"
						className="gap-1.5"
						disabled={!detail}
						onClick={onUseAsTemplate}
					>
						<CopyIcon className="size-3.5" aria-hidden="true" />
						Use as template
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
