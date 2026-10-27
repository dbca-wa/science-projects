import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";
import { getUserDisplayName } from "@/shared/utils/user.utils";
import { hoverScaleVariants, springConfig } from "@/shared/config/animations";
import type {
	IReaction,
	ReactionType,
	IGroupedReaction,
} from "@/shared/types/comment.types";

interface ReactionDisplayProps {
	reactions: IReaction[];
	currentUserId: number | undefined;
	onReactionToggle: (reactionType: ReactionType) => void;
	canInteract: boolean;
}

/**
 * Emoji mapping for reaction types (5 reactions)
 */
const REACTION_EMOJIS: Record<ReactionType, string> = {
	thumbup: "👍",
	heart: "❤️",
	funny: "😄",
	confused: "😕",
	surprised: "😮",
};

/**
 * Action phrases for reaction types
 * Used in tooltips to describe what the reaction means
 */
const REACTION_ACTIONS: Record<ReactionType, string> = {
	thumbup: "like this",
	heart: "love this",
	funny: "found this funny",
	confused: "are confused by this",
	surprised: "are surprised by this",
};

/**
 * Group reactions by type and calculate counts
 */
function groupReactions(
	reactions: IReaction[],
	currentUserId: number | undefined
): IGroupedReaction[] {
	const grouped = new Map<ReactionType, IGroupedReaction>();

	reactions.forEach((reaction) => {
		const existing = grouped.get(reaction.reaction);
		const isCurrentUser = reaction.user.id === currentUserId;

		if (existing) {
			existing.count++;
			existing.users.push(reaction.user);
			if (isCurrentUser) {
				existing.hasCurrentUser = true;
			}
		} else {
			grouped.set(reaction.reaction, {
				type: reaction.reaction,
				count: 1,
				users: [reaction.user],
				hasCurrentUser: isCurrentUser,
			});
		}
	});

	return Array.from(grouped.values());
}

/**
 * Format user list for tooltip with action phrase
 * Shows "You" first if current user reacted, then up to 2 more names, then "and X others"
 * Example: "You, Bob Dylan, Rory B and 4 others like this"
 */
function formatUserList(
	users: IGroupedReaction["users"],
	currentUserId: number | undefined,
	reactionType: ReactionType
): string {
	// Separate current user from others
	const currentUserIndex = users.findIndex((u) => u.id === currentUserId);
	const currentUserInList = currentUserIndex >= 0;

	// Get other users (excluding current user)
	const otherUsers = users.filter((u) => u.id !== currentUserId);
	const otherNames = otherUsers.map((user) => getUserDisplayName(user));

	// Build the list
	const namesToShow: string[] = [];

	// Add "You" first if current user reacted
	if (currentUserInList) {
		namesToShow.push("You");
	}

	// Add up to 2 other names
	const maxOtherNames = 2;
	namesToShow.push(...otherNames.slice(0, maxOtherNames));

	// Calculate remaining count
	const remaining = otherNames.length - maxOtherNames;

	// Get action phrase
	const action = REACTION_ACTIONS[reactionType];

	// Format the string with action
	let userList: string;
	if (remaining > 0) {
		// "You, Bob Dylan, Rory B and 4 others"
		userList = `${namesToShow.join(", ")} and ${remaining} ${remaining === 1 ? "other" : "others"}`;
	} else if (namesToShow.length === 1) {
		// "You" or "Bob Dylan"
		userList = namesToShow[0];
	} else if (namesToShow.length === 2) {
		// "You and Bob Dylan"
		userList = `${namesToShow[0]} and ${namesToShow[1]}`;
	} else {
		// "You, Bob Dylan and Rory B"
		const lastName = namesToShow[namesToShow.length - 1];
		const otherNamesList = namesToShow.slice(0, -1).join(", ");
		userList = `${otherNamesList} and ${lastName}`;
	}

	return `${userList} ${action}`;
}

/**
 * ReactionDisplay Component
 *
 * Displays reaction counts grouped by type with user tooltips.
 * Highlights user's own reactions and allows toggling reactions on/off.
 * Respects prefers-reduced-motion for animations.
 * When canInteract is false, displays reactions in view-only mode.
 *
 * Responsive behaviour:
 * - Wide (>380px): Shows all reactions inline
 * - Narrow (≤380px): Shows compact button with popover containing all reactions
 */
export const ReactionDisplay = ({
	reactions,
	currentUserId,
	onReactionToggle,
	canInteract,
}: ReactionDisplayProps) => {
	const shouldReduceMotion = useReducedMotion();
	const [isPopoverOpen, setIsPopoverOpen] = useState(false);

	// Group reactions by type
	const groupedReactions = useMemo(
		() => groupReactions(reactions, currentUserId),
		[reactions, currentUserId]
	);

	// Don't render if no reactions
	if (groupedReactions.length === 0) {
		return null;
	}

	// Calculate total reaction count for compact button
	const totalCount = groupedReactions.reduce((sum, g) => sum + g.count, 0);

	// Icon for the compact (narrow) button: when a single reaction type is
	// present, show that reaction's emoji so a lone heart reads as ❤️, not a
	// generic 😊. Only fall back to the generic face when types are mixed.
	const compactIcon =
		groupedReactions.length === 1
			? REACTION_EMOJIS[groupedReactions[0].type]
			: "😊";

	// Animation variants (disabled if reduced motion or not interactive)
	const animationProps =
		shouldReduceMotion || !canInteract
			? {}
			: {
					initial: "rest",
					whileHover: "hover",
					whileTap: "tap",
					variants: hoverScaleVariants,
				};

	// Render individual reaction button
	const renderReactionButton = (grouped: IGroupedReaction) => (
		<Tooltip key={grouped.type} delayDuration={200}>
			<TooltipTrigger asChild>
				<motion.button
					type="button"
					onClick={
						canInteract ? () => onReactionToggle(grouped.type) : undefined
					}
					className={cn(
						"inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
						canInteract &&
							"focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
						grouped.hasCurrentUser
							? "bg-blue-100 dark:bg-blue-900 border-2 border-blue-500 text-blue-900 dark:text-blue-100"
							: "bg-muted text-muted-foreground",
						canInteract
							? grouped.hasCurrentUser
								? "cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
								: "cursor-pointer hover:bg-muted/80"
							: "cursor-default"
					)}
					aria-label={`${REACTION_EMOJIS[grouped.type]} ${grouped.count} ${
						grouped.count === 1 ? "reaction" : "reactions"
					}${grouped.hasCurrentUser ? " (you reacted)" : ""}${
						!canInteract ? " (view only)" : ""
					}`}
					aria-disabled={!canInteract}
					{...animationProps}
				>
					<span className="text-sm" aria-hidden="true">
						{REACTION_EMOJIS[grouped.type]}
					</span>
					<motion.span
						key={grouped.count}
						initial={shouldReduceMotion || !canInteract ? {} : { scale: 1.3 }}
						animate={{ scale: 1 }}
						transition={shouldReduceMotion || !canInteract ? {} : springConfig}
					>
						{grouped.count}
					</motion.span>
				</motion.button>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-xs">
				<p className="text-xs">
					{formatUserList(grouped.users, currentUserId, grouped.type)}
				</p>
			</TooltipContent>
		</Tooltip>
	);

	return (
		<>
			{/* Wide view (>380px): Show all reactions inline */}
			<div
				className="hidden @[380px]:flex flex-wrap gap-1 mt-2"
				role="group"
				aria-label="Reactions"
			>
				{groupedReactions.map(renderReactionButton)}
			</div>

			{/* Narrow view (≤380px): Show compact button with popover */}
			<div className="flex @[380px]:hidden mt-2">
				<Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
					<Tooltip>
						<TooltipTrigger asChild>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
									aria-label={`${totalCount} ${totalCount === 1 ? "reaction" : "reactions"}`}
								>
									<span className="text-sm" aria-hidden="true">
										{compactIcon}
									</span>
									<span>{totalCount}</span>
								</button>
							</PopoverTrigger>
						</TooltipTrigger>
						<TooltipContent className="z-[9999]">
							<p>View reactions</p>
						</TooltipContent>
					</Tooltip>
					<PopoverContent className="w-fit min-w-0 p-2" side="top" align="end">
						<div
							className="flex flex-wrap gap-1"
							role="group"
							aria-label="Reactions"
						>
							{groupedReactions.map(renderReactionButton)}
						</div>
					</PopoverContent>
				</Popover>
			</div>
		</>
	);
};
