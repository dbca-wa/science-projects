import { useState, useCallback, useMemo, useEffect } from "react";
import { observer } from "mobx-react-lite";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { toast } from "sonner";
import { RecipientSection } from "./RecipientSection";
import { AnnouncementCustomMessage } from "./AnnouncementCustomMessage";
import { EmailPreview } from "./EmailPreview";
import { SuccessAnimation } from "@/shared/components/SuccessAnimation";
import { AnnouncementStore } from "@/app/stores/derived/announcement.store";
import { useNewCyclePreview } from "@/shared/hooks/queries/useBumpEmails";
import {
	useSendAnnouncement,
	useAnnouncementEmailPreview,
} from "@/features/admin/hooks/useAnnouncement";
import type { SendAnnouncementPayload } from "@/features/admin/hooks/useAnnouncement";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";

const GREEN_CHECKBOX =
	"data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 border-gray-400 dark:border-gray-500 shadow-sm";

/**
 * Announcement tab content for the Admin Test Page.
 * Allows admins to send announcement emails to selected recipient groups.
 */
interface AnnouncementContentProps {
	/**
	 * Optional shared store. When omitted, the component creates its own —
	 * preserving backward-compatible standalone usage.
	 */
	store?: AnnouncementStore;
}

export const AnnouncementContent = observer(function AnnouncementContent({
	store: externalStore,
}: AnnouncementContentProps = {}) {
	const [internalStore] = useState(() => new AnnouncementStore());
	const store = externalStore ?? internalStore;
	const { mutate: sendAnnouncement, isPending } = useSendAnnouncement();

	// Debounced custom message for email preview
	const [debouncedMessage, setDebouncedMessage] = useState("");
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedMessage(store.state.customMessage);
		}, 300);
		return () => clearTimeout(timer);
	}, [store.state.customMessage]);

	const { data: recipientPreview } = useNewCyclePreview(
		store.anySendGroup,
		undefined // No division scoping for now
	);

	const { data: previewData, isLoading: previewLoading } =
		useAnnouncementEmailPreview(store.anySendGroup);

	const handleExcludeUser = useCallback(
		(userId: number) => store.excludeUser(userId),
		[store]
	);
	const handleRestoreUser = useCallback(
		(userId: number) => store.restoreUser(userId),
		[store]
	);
	const handleExcludeAll = useCallback(
		(userIds: number[]) => store.excludeUsers(userIds),
		[store]
	);
	const handleRestoreAll = useCallback(
		(userIds: number[]) => store.restoreUsers(userIds),
		[store]
	);

	const allValidEmails = useMemo(() => {
		if (!recipientPreview) return [];
		const excludedSet = new Set(store.state.excludedUserIds);
		const seen = new Set<string>();
		const emails: string[] = [];
		for (const group of [
			store.state.sendBaLeads ? recipientPreview.recipients.ba_leads : [],
			store.state.sendProjectLeads
				? recipientPreview.recipients.project_leads
				: [],
			store.state.sendTeamMembers
				? recipientPreview.recipients.team_members
				: [],
		]) {
			for (const u of group) {
				if (!excludedSet.has(u.pk) && !seen.has(u.email)) {
					seen.add(u.email);
					emails.push(u.email);
				}
			}
		}
		return emails.sort();
	}, [
		recipientPreview,
		store.state.excludedUserIds,
		store.state.sendBaLeads,
		store.state.sendProjectLeads,
		store.state.sendTeamMembers,
	]);

	// Compute the explicit list of user PKs to send to (what the user actually sees)
	const includedUserPks = useMemo(() => {
		if (!recipientPreview) return [];
		const excludedSet = new Set(store.state.excludedUserIds);
		const pks: number[] = [];
		const seen = new Set<number>();
		for (const group of [
			store.state.sendBaLeads ? recipientPreview.recipients.ba_leads : [],
			store.state.sendProjectLeads
				? recipientPreview.recipients.project_leads
				: [],
			store.state.sendTeamMembers
				? recipientPreview.recipients.team_members
				: [],
		]) {
			for (const u of group) {
				if (!excludedSet.has(u.pk) && !seen.has(u.pk)) {
					seen.add(u.pk);
					pks.push(u.pk);
				}
			}
		}
		return pks;
	}, [
		recipientPreview,
		store.state.excludedUserIds,
		store.state.sendBaLeads,
		store.state.sendProjectLeads,
		store.state.sendTeamMembers,
	]);

	const [confirmOpen, setConfirmOpen] = useState(false);
	const [showSuccess, setShowSuccess] = useState(false);
	const [sentCount, setSentCount] = useState(0);

	const handleSend = () => {
		const payload: SendAnnouncementPayload = {
			recipient_groups: store.selectedGroups,
			subject: store.state.subject,
			// Send the explicit list of user PKs to email. This guarantees the
			// backend sends to exactly who the user sees in the UI — no mismatch
			// between preview resolution and send resolution.
			recipient_user_pks: includedUserPks,
		};

		if (store.state.perGroupEnabled) {
			const msgs: Record<string, string> = {};
			for (const g of ["ba_leads", "project_leads", "team_members"] as const) {
				if (store.state.groupCustomEnabled[g]) {
					msgs[g] = store.state.customMessages[g];
				}
			}
			if (Object.keys(msgs).length > 0) {
				payload.custom_messages = msgs;
			}
		} else {
			payload.custom_message = store.state.customMessage;
		}

		sendAnnouncement(payload, {
			onSuccess: (data) => {
				setSentCount(data.emails_sent);
				setShowSuccess(true);
			},
		});
	};

	const handleSuccessComplete = () => {
		setShowSuccess(false);
		setConfirmOpen(false);
		store.reset();
	};

	return (
		<div className="space-y-6">
			{/* Subject line */}
			<div className="space-y-2">
				<Label htmlFor="announcement-subject" className="text-sm font-medium">
					Email Subject
				</Label>
				<Input
					id="announcement-subject"
					value={store.state.subject}
					onChange={(e) => store.setSubject(e.target.value)}
					placeholder="SPMS: Announcement"
				/>
			</div>

			{/* Recipient group checkboxes */}
			<div className="rounded-lg border shadow-sm p-6">
				<h3 className="text-base font-semibold mb-4">
					Send Announcement Emails To
				</h3>
				<div className="flex flex-wrap gap-x-6 gap-y-2">
					<div className="flex items-center gap-2">
						<Checkbox
							id="ann-send-ba"
							className={GREEN_CHECKBOX}
							checked={store.state.sendBaLeads}
							onCheckedChange={(c) => store.setSendBaLeads(c === true)}
						/>
						<Label htmlFor="ann-send-ba" className="text-sm cursor-pointer">
							Business Area Leads
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="ann-send-pl"
							className={GREEN_CHECKBOX}
							checked={store.state.sendProjectLeads}
							onCheckedChange={(c) => store.setSendProjectLeads(c === true)}
						/>
						<Label htmlFor="ann-send-pl" className="text-sm cursor-pointer">
							Project Leads
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="ann-send-tm"
							className={GREEN_CHECKBOX}
							checked={store.state.sendTeamMembers}
							onCheckedChange={(c) => store.setSendTeamMembers(c === true)}
						/>
						<Label htmlFor="ann-send-tm" className="text-sm cursor-pointer">
							Project Team
						</Label>
					</div>
				</div>
				<p className="text-xs text-muted-foreground mt-2">
					Deduplicated by highest role (BA Lead &gt; Project Lead &gt; Team
					Member).
				</p>
			</div>

			{/* Recipient lists */}
			{store.anySendGroup && recipientPreview && (
				<>
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">
							{allValidEmails.length} unique recipient
							{allValidEmails.length !== 1 ? "s" : ""}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 gap-1.5 text-xs"
							onClick={() => {
								navigator.clipboard
									.writeText(allValidEmails.join("; "))
									.then(() =>
										toast.success(
											`${allValidEmails.length} email${allValidEmails.length !== 1 ? "s" : ""} copied`
										)
									);
							}}
						>
							<Copy className="size-3" aria-hidden="true" />
							Copy All
						</Button>
					</div>
					<div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
						{store.state.sendBaLeads && (
							<RecipientSection
								title="Business Area Leads"
								users={recipientPreview.recipients.ba_leads}
								excludedUserIds={store.state.excludedUserIds}
								onExcludeUser={handleExcludeUser}
								onRestoreUser={handleRestoreUser}
								onExcludeAll={handleExcludeAll}
								onRestoreAll={handleRestoreAll}
							/>
						)}
						{store.state.sendProjectLeads && (
							<RecipientSection
								title="Project Leads"
								users={recipientPreview.recipients.project_leads}
								excludedUserIds={store.state.excludedUserIds}
								onExcludeUser={handleExcludeUser}
								onRestoreUser={handleRestoreUser}
								onExcludeAll={handleExcludeAll}
								onRestoreAll={handleRestoreAll}
							/>
						)}
						{store.state.sendTeamMembers && (
							<RecipientSection
								title="Team Members"
								users={recipientPreview.recipients.team_members}
								excludedUserIds={store.state.excludedUserIds}
								onExcludeUser={handleExcludeUser}
								onRestoreUser={handleRestoreUser}
								onExcludeAll={handleExcludeAll}
								onRestoreAll={handleRestoreAll}
							/>
						)}
					</div>
				</>
			)}

			{/* Custom message */}
			{store.anySendGroup && (
				<AnnouncementCustomMessage
					enabled={true}
					onEnabledChange={() => {}}
					message={store.state.customMessage}
					onMessageChange={(html) => store.setCustomMessage(html)}
					isValid={store.isCustomMessageValid}
					perGroupEnabled={store.state.perGroupEnabled}
					onPerGroupChange={(enabled) => store.setPerGroupEnabled(enabled)}
					checkedGroupKeys={store.checkedGroupKeys}
					groupCustomEnabled={store.state.groupCustomEnabled}
					onGroupCustomEnabledChange={(group, enabled) =>
						store.setGroupCustomEnabled(group, enabled)
					}
					groupMessages={store.state.customMessages}
					onGroupMessageChange={(group, html) =>
						store.setGroupMessage(group, html)
					}
					sendGroupCount={store.sendGroupCount}
				/>
			)}

			{/* Email preview */}
			{store.anySendGroup && (
				<div className="space-y-2">
					<h3 className="text-base font-semibold">Email Preview</h3>
					<EmailPreview
						html={previewData?.html}
						isLoading={previewLoading}
						customMessage={debouncedMessage}
						defaultText="Please log in to SPMS for more information."
					/>
				</div>
			)}

			{/* Send button with confirmation */}
			<div className="flex justify-end">
				<AlertDialog
					open={confirmOpen}
					onOpenChange={(next) => {
						// Block closing during send or success animation
						if (!next && (isPending || showSuccess)) return;
						setConfirmOpen(next);
					}}
				>
					<AlertDialogTrigger asChild>
						<Button
							disabled={!store.canSubmit || isPending}
							size="lg"
							className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
						>
							{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
							Send Announcement
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						{showSuccess ? (
							<SuccessAnimation
								title="Announcement sent"
								subtitle={`Sent to ${sentCount} recipient${sentCount !== 1 ? "s" : ""}.`}
								onComplete={handleSuccessComplete}
							/>
						) : (
							<>
								<AlertDialogHeader>
									<AlertDialogTitle>Send Announcement?</AlertDialogTitle>
									<AlertDialogDescription>
										This will send an announcement email to{" "}
										<strong>{allValidEmails.length}</strong> recipient
										{allValidEmails.length !== 1 ? "s" : ""}. This action cannot
										be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction onClick={handleSend}>
										Send to {allValidEmails.length} recipient
										{allValidEmails.length !== 1 ? "s" : ""}
									</AlertDialogAction>
								</AlertDialogFooter>
							</>
						)}
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
});
