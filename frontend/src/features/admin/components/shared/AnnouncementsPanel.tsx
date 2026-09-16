import { useState, useRef, useCallback } from "react";
import { AnnouncementStore } from "@/app/stores/derived/announcement.store";
import { AnnouncementContent } from "./AnnouncementContent";
import { EmailHistory } from "./EmailHistory";

/**
 * Announcements tab panel.
 *
 * Owns a single AnnouncementStore instance shared between the composer and the
 * email history, so "Use as template" from a prior email can prepopulate the
 * composer. The history sits below the composer; applying a template scrolls
 * the composer into view.
 */
export const AnnouncementsPanel = () => {
	const [store] = useState(() => new AnnouncementStore());
	const composerRef = useRef<HTMLDivElement>(null);

	const handleUseAsTemplate = useCallback(
		(subject: string, body: string, groupMessages: Record<string, string>) => {
			store.applyTemplate(subject, body, groupMessages);
			composerRef.current?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			});
		},
		[store]
	);

	return (
		<div className="space-y-10">
			<div ref={composerRef}>
				<AnnouncementContent store={store} />
			</div>
			<EmailHistory onUseAsTemplate={handleUseAsTemplate} />
		</div>
	);
};
