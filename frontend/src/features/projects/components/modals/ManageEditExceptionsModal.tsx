import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import { getImageUrl } from "@/shared/utils/image.utils";
import {
	useCreateEditException,
	useDocumentEditExceptions,
	useRevokeEditException,
} from "../../hooks/useEditExceptions";
import type { IEditExceptionUser } from "@/shared/types/document.types";

interface ManageEditExceptionsModalProps {
	isOpen: boolean;
	onClose: () => void;
	documentId: number;
	projectId: number;
}

const DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const userInitials = (user: IEditExceptionUser): string => {
	const first = user.display_first_name?.[0] ?? "";
	const last = user.display_last_name?.[0] ?? "";
	return (first + last).toUpperCase() || user.name.slice(0, 2).toUpperCase();
};

const formatExpiry = (expiresAt: string): string => {
	const date = new Date(expiresAt);
	if (Number.isNaN(date.getTime())) return expiresAt;
	return date.toLocaleString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

export const ManageEditExceptionsModal = ({
	isOpen,
	onClose,
	documentId,
	projectId,
}: ManageEditExceptionsModalProps) => {
	const [selectedUserId, setSelectedUserId] = useState<string>("");
	const [days, setDays] = useState<string>("1");

	const { data, isLoading } = useDocumentEditExceptions(documentId, isOpen);
	const createMutation = useCreateEditException();
	const revokeMutation = useRevokeEditException();

	const eligibleUsers = data?.eligible_users ?? [];
	const activeExceptions = data?.active_exceptions ?? [];

	const handleGrant = () => {
		if (!selectedUserId) return;
		createMutation.mutate(
			{
				projectId,
				documentId,
				userId: Number(selectedUserId),
				days: Number(days),
			},
			{
				onSuccess: () => {
					setSelectedUserId("");
					setDays("1");
				},
			}
		);
	};

	const handleRevoke = (exceptionId: number) => {
		revokeMutation.mutate({ projectId, documentId, exceptionId });
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Manage edit access</DialogTitle>
					<DialogDescription>
						Grant a project member or the business area leader temporary access
						to edit this locked document. Access does not permit changes to the
						document's approval status.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Grant form */}
					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="edit-exception-user">User</Label>
							<Select
								value={selectedUserId}
								onValueChange={setSelectedUserId}
								disabled={isLoading || eligibleUsers.length === 0}
							>
								<SelectTrigger id="edit-exception-user">
									<SelectValue
										placeholder={
											eligibleUsers.length === 0
												? "No eligible users available"
												: "Select a user"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{eligibleUsers.map((user) => (
										<SelectItem key={user.id} value={String(user.id)}>
											{user.name} ({user.email})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-exception-days">Duration (days)</Label>
							<Select value={days} onValueChange={setDays}>
								<SelectTrigger id="edit-exception-days">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DURATION_OPTIONS.map((option) => (
										<SelectItem key={option} value={String(option)}>
											{option} {option === 1 ? "day" : "days"}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<Button
							onClick={handleGrant}
							disabled={!selectedUserId || createMutation.isPending}
						>
							{createMutation.isPending ? "Granting..." : "Grant access"}
						</Button>
					</div>

					{/* Active exceptions */}
					<div className="space-y-2">
						<h3 className="text-sm font-medium">Active access</h3>
						{isLoading && (
							<p className="text-sm text-muted-foreground">Loading...</p>
						)}
						{!isLoading && activeExceptions.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No one currently has temporary edit access.
							</p>
						)}
						<ul className="space-y-2">
							{activeExceptions.map((exception) => (
								<li
									key={exception.id}
									className="flex items-center justify-between gap-3 rounded-md border p-3"
								>
									<div className="flex items-center gap-3">
										<Avatar className="size-8">
											<AvatarImage
												src={
													exception.user.image
														? getImageUrl(exception.user.image)
														: undefined
												}
												alt=""
											/>
											<AvatarFallback>
												{userInitials(exception.user)}
											</AvatarFallback>
										</Avatar>
										<div>
											<div className="text-sm font-medium">
												{exception.user.name}
											</div>
											<div className="text-xs text-muted-foreground">
												Expires {formatExpiry(exception.expires_at)}
											</div>
										</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleRevoke(exception.id)}
										disabled={revokeMutation.isPending}
									>
										Revoke
									</Button>
								</li>
							))}
						</ul>
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
