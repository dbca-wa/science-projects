import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2, FileDown } from "lucide-react";
import { useDocumentTitle } from "@/shared/hooks/useDocumentTitle";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Tabs,
	TabsList,
	TabsTrigger,
	TabsContent,
} from "@/shared/components/ui/tabs";
import { UserSearchDropdown } from "@/shared/components/user/UserSearchDropdown";
import {
	useEmailTestingSettings,
	useUpdateEmailTestingSettings,
	useSendAllTestEmails,
} from "@/features/admin/hooks/useEmailTestingSettings";
import {
	useGenerateTestPDF,
	useGenerateAllTestPDFs,
} from "@/features/admin/hooks/useTestPDF";
import { AnnouncementsPanel } from "@/features/admin/components/shared/AnnouncementsPanel";
import { BannerContent } from "@/features/admin/components/shared/BannerContent";

/** All available email templates with human-readable labels */
const EMAIL_TEMPLATES = [
	{ name: "document_approved_email", label: "Document Approved" },
	{
		name: "document_approved_directorate_email",
		label: "Document Approved (Directorate)",
	},
	{ name: "document_recalled_email", label: "Document Recalled" },
	{ name: "document_sent_back_email", label: "Document Sent Back" },
	{ name: "document_ready_email", label: "Document Ready for Review" },
	{ name: "feedback_received_email", label: "Feedback Received" },
	{ name: "review_document_email", label: "Review Requested" },
	{ name: "bump_email", label: "Bump Reminder (Single)" },
	{ name: "bump_consolidated_email", label: "Bump Reminder (Consolidated)" },
	{
		name: "batch_approved_consolidated_email",
		label: "Batch Approval (Consolidated)",
	},
	{ name: "document_comment_mention", label: "Comment Mention" },
	{ name: "new_comment_email", label: "New Comment" },
	{ name: "new_cycle_open_email", label: "New Cycle Open" },
	{ name: "project_closed_email", label: "Project Closed" },
	{ name: "project_reopened_email", label: "Project Reopened" },
	{ name: "spms_link_email", label: "SPMS Invite" },
	{ name: "staff_profile_email", label: "Staff Profile Contact" },
	{ name: "announcement_email", label: "Announcement" },
] as const;

const EmailTestingContent = () => {
	const { data: settings } = useEmailTestingSettings();
	const { mutate: updateSettings, isPending } = useUpdateEmailTestingSettings();
	const { mutate: sendEmails, isPending: isSendingAll } =
		useSendAllTestEmails();

	const [testingMode, setTestingMode] = useState(false);
	const [testUserId, setTestUserId] = useState<number | null>(null);
	const [recipientUserId, setRecipientUserId] = useState<number | null>(null);
	const [actionerUserId, setActionerUserId] = useState<number | null>(null);
	const [hasInitialised, setHasInitialised] = useState(false);
	const [sendingTemplate, setSendingTemplate] = useState<string | null>(null);

	// Sync local state from server settings on first load
	if (settings && !hasInitialised) {
		setTestingMode(settings.email_testing_mode);
		setTestUserId(settings.email_test_user?.id ?? null);
		setHasInitialised(true);
	}

	const hasChanges =
		settings &&
		(testingMode !== settings.email_testing_mode ||
			testUserId !== (settings.email_test_user?.id ?? null));

	const isValid = !testingMode || testUserId !== null;

	const canSendEmails =
		settings?.email_testing_mode && settings?.email_test_user;

	const handleSave = () => {
		updateSettings({
			email_testing_mode: testingMode,
			email_test_user: testingMode ? testUserId : null,
		});
	};

	const handleSendAll = () => {
		sendEmails({
			recipient_user_id: recipientUserId,
			actioner_user_id: actionerUserId,
		});
	};

	const handleSendSingle = (templateName: string) => {
		setSendingTemplate(templateName);
		sendEmails(
			{
				recipient_user_id: recipientUserId,
				actioner_user_id: actionerUserId,
				template_name: templateName,
			},
			{
				onSettled: () => setSendingTemplate(null),
			}
		);
	};

	return (
		<div className="space-y-6">
			{/* Status banner */}
			{settings?.email_testing_mode && settings.email_test_user && (
				<div className="rounded-md border border-blue-300 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-950">
					<p className="text-sm font-medium text-blue-800 dark:text-blue-200">
						Testing mode is ON — all emails will be sent to{" "}
						{settings.email_test_user.display_first_name}{" "}
						{settings.email_test_user.display_last_name} (
						{settings.email_test_user.email})
					</p>
				</div>
			)}

			{/* Settings and overrides — side by side on desktop */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Testing Mode Settings */}
				<Card>
					<CardHeader>
						<CardTitle>Testing Mode</CardTitle>
						<CardDescription>
							Redirect all outgoing emails to a single test user
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label htmlFor="testing-mode" className="text-base font-medium">
									Email Testing Mode
								</Label>
								<p className="text-sm text-gray-500 dark:text-gray-400">
									When enabled, all emails go to the test user below
								</p>
							</div>
							<Switch
								id="testing-mode"
								checked={testingMode}
								onCheckedChange={setTestingMode}
								className="data-[state=checked]:bg-green-600"
							/>
						</div>

						{testingMode && (
							<UserSearchDropdown
								label="Test User"
								placeholder="Search for a superuser..."
								helperText="All emails will be redirected to this user"
								isRequired={true}
								onlyInternal={true}
								setUserFunction={setTestUserId}
								preselectedUserPk={testUserId ?? undefined}
							/>
						)}

						<div className="flex justify-end pt-2">
							<Button
								onClick={handleSave}
								disabled={!hasChanges || !isValid || isPending}
							>
								{isPending ? "Saving..." : "Save"}
							</Button>
						</div>
					</CardContent>
				</Card>

				{/* User overrides and Send All */}
				<Card>
					<CardHeader>
						<CardTitle>Custom Context</CardTitle>
						<CardDescription>
							Optionally set real users for the recipient and actioner fields to
							see realistic email content
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{!canSendEmails && (
							<p className="text-sm text-amber-600 dark:text-amber-400">
								Enable testing mode and set a test user before sending.
							</p>
						)}

						{canSendEmails && (
							<>
								<UserSearchDropdown
									label="Recipient name"
									placeholder="Use default sample name..."
									helperText="Overrides the recipient name in all templates"
									isRequired={false}
									onlyInternal={true}
									setUserFunction={setRecipientUserId}
									preselectedUserPk={recipientUserId ?? undefined}
								/>
								<UserSearchDropdown
									label="Actioner / sender name"
									placeholder="Use default sample name..."
									helperText="Overrides the actioning user name in all templates"
									isRequired={false}
									onlyInternal={true}
									setUserFunction={setActionerUserId}
									preselectedUserPk={actionerUserId ?? undefined}
								/>
							</>
						)}

						<div className="flex justify-end pt-2">
							<Button
								onClick={handleSendAll}
								disabled={!canSendEmails || isSendingAll}
								className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
							>
								{isSendingAll && !sendingTemplate
									? "Sending all..."
									: "Send All Emails"}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Template grid */}
			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
					Email Templates
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{EMAIL_TEMPLATES.map((template) => (
						<Card key={template.name} className="py-4">
							<CardContent className="flex items-center justify-between gap-3 pb-0">
								<div className="min-w-0">
									<p className="text-sm font-medium text-gray-900 dark:text-gray-100">
										{template.label}
									</p>
									<p className="truncate text-xs text-gray-500 dark:text-gray-400">
										{template.name}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleSendSingle(template.name)}
									disabled={!canSendEmails || sendingTemplate === template.name}
									className="shrink-0"
								>
									{sendingTemplate === template.name ? "Sending..." : "Send"}
								</Button>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		</div>
	);
};

const DOCUMENT_KINDS = [
	{ value: "concept", label: "Concept Plan" },
	{ value: "projectplan", label: "Project Plan" },
	{ value: "progressreport", label: "Progress Report" },
	{ value: "studentreport", label: "Student Report" },
	{ value: "projectclosure", label: "Project Closure" },
] as const;

const DocumentTestingContent = () => {
	const [selectedKind, setSelectedKind] = useState("concept");
	const generateMutation = useGenerateTestPDF();
	const generateAllMutation = useGenerateAllTestPDFs();

	const handleGenerate = () => {
		generateMutation.mutate(selectedKind, {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(blob);
				try {
					const a = document.createElement("a");
					a.href = url;
					a.download = `test-${selectedKind}.pdf`;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					toast.success("PDF downloaded");
				} finally {
					URL.revokeObjectURL(url);
				}
			},
			onError: (error: Error) => {
				toast.error(error.message || "PDF generation failed");
			},
		});
	};

	const handleGenerateAll = () => {
		generateAllMutation.mutate(undefined, {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(blob);
				try {
					const a = document.createElement("a");
					a.href = url;
					a.download = "test-pdfs-all.zip";
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					toast.success("All PDFs downloaded as ZIP");
				} finally {
					URL.revokeObjectURL(url);
				}
			},
			onError: (error: Error) => {
				toast.error(error.message || "PDF generation failed");
			},
		});
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-gray-500 dark:text-gray-400">
				Generate test PDFs with mock data to preview document template designs.
			</p>
			<div className="flex items-end gap-4">
				<div className="w-64 space-y-2">
					<Label htmlFor="document-kind">Document Kind</Label>
					<Select value={selectedKind} onValueChange={setSelectedKind}>
						<SelectTrigger id="document-kind">
							<SelectValue placeholder="Select document kind" />
						</SelectTrigger>
						<SelectContent>
							{DOCUMENT_KINDS.map((kind) => (
								<SelectItem key={kind.value} value={kind.value}>
									{kind.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					onClick={handleGenerate}
					disabled={generateMutation.isPending || generateAllMutation.isPending}
					className="gap-2"
				>
					{generateMutation.isPending ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							Generating...
						</>
					) : (
						<>
							<FileDown className="size-4" />
							Generate PDF
						</>
					)}
				</Button>
				<Button
					onClick={handleGenerateAll}
					disabled={generateMutation.isPending || generateAllMutation.isPending}
					variant="outline"
					className="gap-2"
				>
					{generateAllMutation.isPending ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							Generating All...
						</>
					) : (
						<>
							<FileDown className="size-4" />
							Generate All (ZIP)
						</>
					)}
				</Button>
			</div>
		</div>
	);
};

const VALID_TABS = ["banner", "emails", "announcements", "documents"] as const;
type CommsTab = (typeof VALID_TABS)[number];

const AdminTestPage = () => {
	useDocumentTitle("Communications");
	const { tab } = useParams<{ tab?: string }>();
	const navigate = useNavigate();

	const activeTab: CommsTab = VALID_TABS.includes(tab as CommsTab)
		? (tab as CommsTab)
		: "banner";

	const handleTabChange = (value: string) => {
		navigate(`/manage/communications/${value}`, { replace: true });
	};

	const { isLoading } = useEmailTestingSettings();

	if (isLoading) {
		return (
			<div className="container mx-auto space-y-6 p-6">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
					Communications
				</h1>
				<p className="text-sm text-gray-500">Loading settings...</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto space-y-6 p-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
				Communications
			</h1>

			<Tabs
				value={activeTab}
				onValueChange={handleTabChange}
				className="w-full"
			>
				<TabsList className="w-full flex">
					<TabsTrigger value="banner" className="flex-1">
						Banner
					</TabsTrigger>
					<TabsTrigger value="emails" className="flex-1">
						Emails
					</TabsTrigger>
					<TabsTrigger value="announcements" className="flex-1">
						Announcements
					</TabsTrigger>
					<TabsTrigger value="documents" className="flex-1">
						Documents
					</TabsTrigger>
				</TabsList>

				<TabsContent value="banner">
					<BannerContent />
				</TabsContent>

				<TabsContent value="emails">
					<EmailTestingContent />
				</TabsContent>

				<TabsContent value="announcements">
					<AnnouncementsPanel />
				</TabsContent>

				<TabsContent value="documents">
					<DocumentTestingContent />
				</TabsContent>
			</Tabs>
		</div>
	);
};

export default AdminTestPage;
