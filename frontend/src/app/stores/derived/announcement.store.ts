import { makeObservable, action, computed } from "mobx";
import { BaseStore, type BaseStoreState } from "../base.store";

type GroupKey = "ba_leads" | "project_leads" | "team_members";

const EMPTY_HTML_PATTERNS = [
	"",
	"<p></p>",
	"<p><br></p>",
	"<p> </p>",
	"<p><br/></p>",
];

const isHtmlEmpty = (html: string): boolean => {
	const trimmed = html.trim();
	if (EMPTY_HTML_PATTERNS.includes(trimmed)) return true;
	const div = document.createElement("div");
	div.innerHTML = trimmed;
	return (div.textContent ?? "").trim().length === 0;
};

interface AnnouncementStoreState extends BaseStoreState {
	sendBaLeads: boolean;
	sendProjectLeads: boolean;
	sendTeamMembers: boolean;
	excludedUserIds: number[];
	customMessage: string;
	perGroupEnabled: boolean;
	groupCustomEnabled: Record<GroupKey, boolean>;
	customMessages: Record<GroupKey, string>;
	activePreviewGroup: GroupKey;
	subject: string;
}

const DEFAULT_STATE: Omit<
	AnnouncementStoreState,
	"loading" | "error" | "initialised"
> = {
	sendBaLeads: false,
	sendProjectLeads: false,
	sendTeamMembers: false,
	excludedUserIds: [],
	customMessage: "",
	perGroupEnabled: false,
	groupCustomEnabled: {
		ba_leads: true,
		project_leads: true,
		team_members: true,
	},
	customMessages: { ba_leads: "", project_leads: "", team_members: "" },
	activePreviewGroup: "ba_leads",
	subject: "SPMS: Announcement",
};

export class AnnouncementStore extends BaseStore<AnnouncementStoreState> {
	constructor() {
		super({
			...DEFAULT_STATE,
			loading: false,
			error: null,
			initialised: false,
		});

		makeObservable(this, {
			setSendBaLeads: action,
			setSendProjectLeads: action,
			setSendTeamMembers: action,
			excludeUser: action,
			restoreUser: action,
			excludeUsers: action,
			restoreUsers: action,
			setCustomMessage: action,
			setPerGroupEnabled: action,
			setGroupCustomEnabled: action,
			setGroupMessage: action,
			setActivePreviewGroup: action,
			setSubject: action,
			applyTemplate: action,
			reset: action,

			anySendGroup: computed,
			checkedGroupKeys: computed,
			sendGroupCount: computed,
			selectedGroups: computed,
			isCustomMessageValid: computed,
			canSubmit: computed,
		});
	}

	// --- Actions ---

	setSendBaLeads = (value: boolean) => {
		this.state.sendBaLeads = value;
	};
	setSendProjectLeads = (value: boolean) => {
		this.state.sendProjectLeads = value;
	};
	setSendTeamMembers = (value: boolean) => {
		this.state.sendTeamMembers = value;
	};

	excludeUser = (userId: number) => {
		if (!this.state.excludedUserIds.includes(userId)) {
			// Use assignment (not push) so React components that memoise on the
			// array reference detect the change.
			this.state.excludedUserIds = [...this.state.excludedUserIds, userId];
		}
	};

	restoreUser = (userId: number) => {
		this.state.excludedUserIds = this.state.excludedUserIds.filter(
			(id) => id !== userId
		);
	};

	excludeUsers = (userIds: number[]) => {
		const toAdd = userIds.filter(
			(id) => !this.state.excludedUserIds.includes(id)
		);
		if (toAdd.length > 0) {
			this.state.excludedUserIds = [...this.state.excludedUserIds, ...toAdd];
		}
	};

	restoreUsers = (userIds: number[]) => {
		const idSet = new Set(userIds);
		this.state.excludedUserIds = this.state.excludedUserIds.filter(
			(id) => !idSet.has(id)
		);
	};

	setCustomMessage = (html: string) => {
		this.state.customMessage = html;
	};

	setPerGroupEnabled = (enabled: boolean) => {
		this.state.perGroupEnabled = enabled;
	};

	setGroupCustomEnabled = (group: GroupKey, enabled: boolean) => {
		this.state.groupCustomEnabled = {
			...this.state.groupCustomEnabled,
			[group]: enabled,
		};
	};

	setGroupMessage = (group: GroupKey, html: string) => {
		this.state.customMessages = { ...this.state.customMessages, [group]: html };
	};

	setActivePreviewGroup = (group: GroupKey) => {
		this.state.activePreviewGroup = group;
	};

	setSubject = (subject: string) => {
		this.state.subject = subject;
	};

	/**
	 * Prepopulate the composer from a prior email record.
	 *
	 * Sets the subject and message body (single or per-group). Recipients are
	 * intentionally left untouched — the admin must select recipient groups
	 * afresh for the new send.
	 */
	applyTemplate = (
		subject: string,
		body: string,
		groupMessages?: Record<string, string>
	) => {
		this.state.subject = subject;

		const groupEntries = groupMessages
			? (Object.entries(groupMessages) as [GroupKey, string][]).filter(
					([, msg]) => msg && msg.trim().length > 0
				)
			: [];

		if (groupEntries.length > 0) {
			this.state.perGroupEnabled = true;
			const merged: Record<GroupKey, string> = {
				ba_leads: "",
				project_leads: "",
				team_members: "",
			};
			for (const [group, msg] of groupEntries) {
				merged[group] = msg;
			}
			this.state.customMessages = merged;
			this.state.customMessage = "";
		} else {
			this.state.perGroupEnabled = false;
			this.state.customMessage = body;
			this.state.customMessages = {
				ba_leads: "",
				project_leads: "",
				team_members: "",
			};
		}
	};

	reset = () => {
		Object.assign(this.state, DEFAULT_STATE);
	};

	// --- Computed ---

	get anySendGroup(): boolean {
		return (
			this.state.sendBaLeads ||
			this.state.sendProjectLeads ||
			this.state.sendTeamMembers
		);
	}

	get checkedGroupKeys(): GroupKey[] {
		const keys: GroupKey[] = [];
		if (this.state.sendBaLeads) keys.push("ba_leads");
		if (this.state.sendProjectLeads) keys.push("project_leads");
		if (this.state.sendTeamMembers) keys.push("team_members");
		return keys;
	}

	get sendGroupCount(): number {
		return this.checkedGroupKeys.length;
	}

	get selectedGroups(): string[] {
		return this.checkedGroupKeys;
	}

	get isCustomMessageValid(): boolean {
		if (this.state.perGroupEnabled) {
			return this.checkedGroupKeys.every((g) => {
				if (!this.state.groupCustomEnabled[g]) return true;
				return !isHtmlEmpty(this.state.customMessages[g]);
			});
		}
		return !isHtmlEmpty(this.state.customMessage);
	}

	get canSubmit(): boolean {
		return this.anySendGroup && this.isCustomMessageValid;
	}
}
