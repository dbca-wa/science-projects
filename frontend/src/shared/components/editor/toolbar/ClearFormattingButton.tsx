/**
 * ClearFormattingButton Component
 *
 * Button to remove all text formatting while preserving content.
 */

import React from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RemoveFormatting } from "lucide-react";
import { BaseToolbarButton } from "./BaseToolbarButton";
import { $clearTextFormatting } from "./clear-formatting.utils";

interface ClearFormattingButtonProps {
	disabled?: boolean;
}

export const ClearFormattingButton: React.FC<ClearFormattingButtonProps> = ({
	disabled = false,
}) => {
	const [editor] = useLexicalComposerContext();

	const handleClick = () => {
		editor.update($clearTextFormatting);
	};

	return (
		<BaseToolbarButton
			icon={RemoveFormatting}
			label="Clear formatting"
			onClick={handleClick}
			disabled={disabled}
		/>
	);
};
