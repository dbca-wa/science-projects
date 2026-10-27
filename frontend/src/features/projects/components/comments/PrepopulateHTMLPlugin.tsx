import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getRoot,
	$createParagraphNode,
	$createTextNode,
	type ElementNode,
	type TextFormatType,
} from "lexical";
import { $createListNode, $createListItemNode } from "@lexical/list";
import { $createMentionNode } from "@/shared/nodes/MentionNode";

interface PrepopulateHTMLPluginProps {
	html: string;
}

/**
 * PrepopulateHTMLPlugin
 *
 * Plugin to populate Lexical editor with HTML content.
 * Parses HTML and converts it to Lexical editor state.
 *
 * Supports:
 * - Paragraphs
 * - Bold, italic, underline text
 * - Ordered and unordered lists
 * - Mentions (span elements with data-user-id attribute)
 */
export const PrepopulateHTMLPlugin = ({ html }: PrepopulateHTMLPluginProps) => {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		if (!html) return;

		editor.update(() => {
			const root = $getRoot();
			root.clear();

			// Parse HTML
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");
			const body = doc.body;

			// Process each child node
			body.childNodes.forEach((node) => {
				processNode(node, root);
			});
		});
	}, [editor, html]);

	return null;
};

/** Map an inline HTML tag to the Lexical text format it applies, if any. */
const INLINE_TAG_FORMATS: Record<string, TextFormatType> = {
	strong: "bold",
	b: "bold",
	em: "italic",
	i: "italic",
	u: "underline",
	s: "strikethrough",
	strike: "strikethrough",
	del: "strikethrough",
};

/**
 * Process a DOM node and convert it to Lexical nodes.
 *
 * @param domNode The DOM node to convert.
 * @param lexicalParent The Lexical element node to append results to.
 * @param activeFormats Text formats inherited from ancestor inline tags. This
 *   is what makes nested formatting (e.g. <strong><em>text</em></strong>) work:
 *   each inline wrapper adds its format and recurses, so a text node deep in the
 *   tree receives every format from its ancestors, not just the innermost one.
 */
function processNode(
	domNode: Node,
	lexicalParent: ElementNode,
	activeFormats: TextFormatType[] = []
) {
	if (domNode.nodeType === Node.TEXT_NODE) {
		// Text node — preserve spaces between inline elements (e.g. mentions)
		const text = domNode.textContent || "";
		if (text) {
			const textNode = $createTextNode(text);
			for (const format of activeFormats) {
				textNode.toggleFormat(format);
			}
			lexicalParent.append(textNode);
		}
	} else if (domNode.nodeType === Node.ELEMENT_NODE) {
		const element = domNode as HTMLElement;
		const tagName = element.tagName.toLowerCase();

		switch (tagName) {
			case "p": {
				// Paragraph
				const paragraphNode = $createParagraphNode();
				element.childNodes.forEach((child) => {
					processNode(child, paragraphNode, activeFormats);
				});
				lexicalParent.append(paragraphNode);
				break;
			}

			case "ul": {
				// Unordered list
				const listNode = $createListNode("bullet");
				element.childNodes.forEach((child) => {
					if (child.nodeName.toLowerCase() === "li") {
						const listItemNode = $createListItemNode();
						(child as HTMLElement).childNodes.forEach((grandchild) => {
							processNode(grandchild, listItemNode, activeFormats);
						});
						listNode.append(listItemNode);
					}
				});
				lexicalParent.append(listNode);
				break;
			}

			case "ol": {
				// Ordered list
				const listNode = $createListNode("number");
				element.childNodes.forEach((child) => {
					if (child.nodeName.toLowerCase() === "li") {
						const listItemNode = $createListItemNode();
						(child as HTMLElement).childNodes.forEach((grandchild) => {
							processNode(grandchild, listItemNode, activeFormats);
						});
						listNode.append(listItemNode);
					}
				});
				lexicalParent.append(listNode);
				break;
			}

			case "span": {
				// Check if it's a mention
				const userId = element.getAttribute("data-user-id");
				const displayName = element.getAttribute("data-display-name");
				const email = element.getAttribute("data-email");

				if (userId && displayName) {
					// Mention node
					const mentionNode = $createMentionNode({
						user_id: parseInt(userId, 10),
						display_name: displayName,
						email: email || "",
					});
					lexicalParent.append(mentionNode);
				} else {
					// Regular span - process children, preserving active formats
					element.childNodes.forEach((child) => {
						processNode(child, lexicalParent, activeFormats);
					});
				}
				break;
			}

			default: {
				// Inline formatting tags (strong/b, em/i, u, s) add their format
				// and recurse so nested combinations accumulate. Unknown tags fall
				// through here too and simply pass the current formats to children.
				const tagFormat = INLINE_TAG_FORMATS[tagName];
				const nextFormats =
					tagFormat && !activeFormats.includes(tagFormat)
						? [...activeFormats, tagFormat]
						: activeFormats;
				element.childNodes.forEach((child) => {
					processNode(child, lexicalParent, nextFormats);
				});
				break;
			}
		}
	}
}
