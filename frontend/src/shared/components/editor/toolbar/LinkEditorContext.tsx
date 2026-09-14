import { createContext, useState, useCallback, type ReactNode } from "react";
import type { RangeSelection } from "lexical";

interface LinkEditorState {
	isOpen: boolean;
	linkUrl: string;
	linkText: string;
	hasSelection: boolean;
	isEditing: boolean;
	savedSelection: RangeSelection | null;
	linkNodeKey: string | null;
}

interface LinkEditorContextValue {
	state: LinkEditorState;
	openLinkEditor: (opts: {
		url?: string;
		text?: string;
		hasSelection: boolean;
		isEditing: boolean;
		selection?: RangeSelection | null;
		linkNodeKey?: string | null;
	}) => void;
	closeLinkEditor: () => void;
	setLinkUrl: (url: string) => void;
	setLinkText: (text: string) => void;
	saveSelection: (selection: RangeSelection) => void;
}

const LinkEditorContext = createContext<LinkEditorContextValue | null>(null);

export function LinkEditorProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<LinkEditorState>({
		isOpen: false,
		linkUrl: "",
		linkText: "",
		hasSelection: false,
		isEditing: false,
		savedSelection: null,
		linkNodeKey: null,
	});

	const openLinkEditor = useCallback(
		(opts: {
			url?: string;
			text?: string;
			hasSelection: boolean;
			isEditing: boolean;
			selection?: RangeSelection | null;
			linkNodeKey?: string | null;
		}) => {
			setState({
				isOpen: true,
				linkUrl: opts.url || "",
				linkText: opts.text || "",
				hasSelection: opts.hasSelection,
				isEditing: opts.isEditing,
				savedSelection: opts.selection ?? null,
				linkNodeKey: opts.linkNodeKey ?? null,
			});
		},
		[]
	);

	const closeLinkEditor = useCallback(() => {
		setState((prev) => ({
			...prev,
			isOpen: false,
			linkUrl: "",
			linkText: "",
			savedSelection: null,
			linkNodeKey: null,
		}));
	}, []);

	const setLinkUrl = useCallback((url: string) => {
		setState((prev) => ({ ...prev, linkUrl: url }));
	}, []);

	const setLinkText = useCallback((text: string) => {
		setState((prev) => ({ ...prev, linkText: text }));
	}, []);

	const saveSelection = useCallback((selection: RangeSelection) => {
		setState((prev) => ({ ...prev, savedSelection: selection }));
	}, []);

	return (
		<LinkEditorContext.Provider
			value={{
				state,
				openLinkEditor,
				closeLinkEditor,
				setLinkUrl,
				setLinkText,
				saveSelection,
			}}
		>
			{children}
		</LinkEditorContext.Provider>
	);
}

// Context exported for use by useLinkEditor hook in link-editor.utils.ts
// eslint-disable-next-line react-refresh/only-export-components
export { LinkEditorContext };
