import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/services/api/client.service";
import { toast } from "sonner";

export interface SendAnnouncementPayload {
	recipient_groups: string[];
	custom_message?: string;
	custom_messages?: Record<string, string>;
	subject?: string;
	division?: string;
	excluded_user_ids?: number[];
	/** Explicit list of user PKs to send to (takes precedence over excluded_user_ids) */
	recipient_user_pks?: number[];
	/**
	 * When set, sends a single test email to this user only, bypassing all
	 * recipient-group resolution. The subject is prefixed with "[TEST]".
	 */
	test_recipient_pk?: number;
}

interface SendAnnouncementResponse {
	emails_sent: number;
	errors: string[];
}

/** Send announcement emails to selected recipient groups */
export const useSendAnnouncement = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: SendAnnouncementPayload) =>
			apiClient.post<SendAnnouncementResponse>(
				"adminoptions/send-announcement",
				data
			),
		onSuccess: () => {
			// A new email record is created on send — refresh the history list.
			queryClient.invalidateQueries({ queryKey: ["email-records"] });
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to send announcement");
		},
	});
};

export interface SendTestAnnouncementPayload {
	recipient_groups: string[];
	test_recipient_pk: number;
	subject?: string;
	custom_message?: string;
	custom_messages?: Record<string, string>;
}

/**
 * Send a single announcement test email to one user.
 *
 * Delivers exactly one email (subject prefixed with "[TEST]") to the chosen
 * user, ignoring the selected recipient groups. Used to verify an announcement
 * without emailing real recipients.
 */
export const useSendTestAnnouncement = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: SendTestAnnouncementPayload) =>
			apiClient.post<SendAnnouncementResponse>(
				"adminoptions/send-announcement",
				data
			),
		onSuccess: () => {
			// A test send is also recorded — refresh the history list.
			queryClient.invalidateQueries({ queryKey: ["email-records"] });
		},
		onError: (error: Error) => {
			toast.error(error.message || "Failed to send test email");
		},
	});
};

interface EmailPreviewResponse {
	html: string;
}

/** Fetch a rendered announcement email preview */
export const useAnnouncementEmailPreview = (enabled: boolean) => {
	return useQuery({
		queryKey: ["announcement", "email-preview"],
		queryFn: () =>
			apiClient.post<EmailPreviewResponse>(
				"adminoptions/announcement-email-preview",
				{
					recipient_name: "Recipient Name",
					custom_message: "",
					subject: "SPMS: Announcement",
				}
			),
		enabled,
		staleTime: 5 * 60_000,
	});
};
