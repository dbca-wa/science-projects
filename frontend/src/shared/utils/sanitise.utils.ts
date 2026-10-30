import DOMPurifyLib from "dompurify";

/**
 * Get the DOMPurify instance for the current environment
 * In browser: uses window directly
 * In Node.js (tests): uses JSDOM window provided by vitest
 */
function getPurify() {
	return DOMPurifyLib(window);
}

/**
 * Sanitises plain text input by removing all HTML tags.
 * Use this for inputs that should never contain HTML.
 *
 * @param input - The text input to sanitise
 * @returns Plain text with all HTML removed
 *
 * @example
 * ```ts
 * const userInput = '<script>alert("XSS")</script>Hello';
 * const safe = sanitizeInput(userInput);
 * // Returns: 'Hello'
 * ```
 */
export function sanitizeInput(input: string): string {
	const purify = getPurify();
	return purify.sanitize(input, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
	});
}

/**
 * Converts an HTML fragment, such as a project title, to plain text for
 * display as a text node.
 *
 * sanitizeInput removes tags but returns serialised HTML, so "&" comes back
 * as "&amp;" and shows literally when rendered as text. This also decodes
 * entities and collapses whitespace. The result is text: render it as a React
 * child or attribute, never as HTML.
 *
 * @example
 * ```ts
 * toPlainText("<p>Fish &amp; fauna&nbsp;survey</p>");
 * // Returns: 'Fish & fauna survey'
 * ```
 */
export function toPlainText(html: string | null | undefined): string {
	if (!html) return "";
	// Parsing in a separate DOMParser document is inert: nothing loads or runs
	const text =
		new DOMParser().parseFromString(sanitizeInput(html), "text/html").body
			.textContent ?? "";
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Sanitises a URL to prevent javascript: and data: protocol attacks.
 * Only allows http:, https:, and mailto: protocols.
 * Automatically adds https:// if no protocol is specified.
 *
 * @param url - The URL to sanitise
 * @returns Sanitised URL or empty string if invalid
 *
 * @example
 * ```ts
 * const maliciousUrl = 'javascript:alert("XSS")';
 * const safe = sanitizeUrl(maliciousUrl);
 * // Returns: ''
 *
 * const validUrl = 'https://example.com';
 * const safe2 = sanitizeUrl(validUrl);
 * // Returns: 'https://example.com'
 *
 * const noProtocol = 'example.com';
 * const safe3 = sanitizeUrl(noProtocol);
 * // Returns: 'https://example.com'
 * ```
 */
export function sanitizeUrl(url: string): string {
	const purify = getPurify();
	const sanitised = purify.sanitize(url, {
		ALLOWED_TAGS: [],
		ALLOWED_ATTR: [],
	});

	const trimmed = sanitised.trim();
	if (!trimmed) {
		return "";
	}

	// Check for dangerous protocols
	const dangerousProtocols = [
		"javascript:",
		"data:",
		"vbscript:",
		"file:",
		"about:",
	];
	const lowerUrl = trimmed.toLowerCase();

	for (const protocol of dangerousProtocols) {
		if (lowerUrl.startsWith(protocol)) {
			return "";
		}
	}

	// If no protocol, assume https
	let urlToValidate = trimmed;
	if (
		!lowerUrl.startsWith("http://") &&
		!lowerUrl.startsWith("https://") &&
		!lowerUrl.startsWith("mailto:")
	) {
		urlToValidate = `https://${trimmed}`;
	}

	// Validate URL format
	try {
		const urlObj = new URL(urlToValidate);
		const allowedProtocols = ["http:", "https:", "mailto:"];

		if (!allowedProtocols.includes(urlObj.protocol)) {
			return "";
		}

		// For http/https URLs, validate hostname has a TLD (at least one dot)
		if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
			const hostname = urlObj.hostname;
			if (!hostname.includes(".") || hostname.endsWith(".")) {
				return "";
			}
			// TLD must be at least 2 characters
			const tld = hostname.split(".").pop() || "";
			if (tld.length < 2) {
				return "";
			}
		}

		return urlObj.href;
	} catch {
		// If URL parsing fails, it's not a valid URL
		return "";
	}
}

/**
 * Sanitises HTML content for rich text editors.
 * More permissive than sanitizeHtml, allows additional formatting tags.
 *
 * Security Features:
 * - Removes all script tags and content
 * - Removes all event handler attributes (onclick, onerror, etc.)
 * - Blocks dangerous URL protocols (javascript:, data:, vbscript:)
 * - Preserves safe HTML formatting for rich text editing
 *
 * This function is specifically designed for Lexical editor plugins
 * to prevent XSS attacks whilst maintaining rich text capabilities.
 *
 * @param html - The HTML string to sanitise
 * @returns Sanitised HTML string safe for rendering
 *
 * @example
 * ```ts
 * // Remove malicious script
 * const unsafe = '<p>Hello</p><script>alert("XSS")</script>';
 * const safe = sanitizeRichText(unsafe);
 * // Returns: '<p>Hello</p>'
 *
 * // Remove event handlers
 * const unsafe = '<div onclick="alert(1)">Click me</div>';
 * const safe = sanitizeRichText(unsafe);
 * // Returns: '<div>Click me</div>'
 *
 * // Remove dangerous protocols
 * const unsafe = '<a href="javascript:alert(1)">Link</a>';
 * const safe = sanitizeRichText(unsafe);
 * // Returns: '<a>Link</a>'
 * ```
 */
export function sanitizeRichText(html: string): string {
	const purify = getPurify();
	return purify.sanitize(html, {
		ALLOWED_TAGS: [
			"p",
			"br",
			"strong",
			"b",
			"em",
			"i",
			"u",
			"s",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"ul",
			"ol",
			"li",
			"a",
			"blockquote",
			"code",
			"pre",
			"span",
			"div",
			"table",
			"thead",
			"tbody",
			"tr",
			"th",
			"td",
			"sub",
			"sup",
			"img",
		],
		ALLOWED_ATTR: [
			"href",
			"target",
			"rel",
			"src",
			"alt",
			"title",
			"class",
			"style",
			"role",
			"aria-level",
			"aria-checked",
			"tabindex",
			"__lexicallisttype",
		],
		ALLOW_DATA_ATTR: true,
		// Explicitly forbid dangerous tags
		FORBID_TAGS: [
			"script",
			"iframe",
			"object",
			"embed",
			"applet",
			"meta",
			"link",
			"style",
		],
		// Explicitly forbid all event handler attributes
		FORBID_ATTR: [
			"onclick",
			"onload",
			"onerror",
			"onmouseover",
			"onmouseout",
			"onmouseenter",
			"onmouseleave",
			"onmousedown",
			"onmouseup",
			"onfocus",
			"onblur",
			"onchange",
			"onsubmit",
			"onkeydown",
			"onkeyup",
			"onkeypress",
			"ondblclick",
			"oncontextmenu",
			"oninput",
			"oninvalid",
			"onreset",
			"onsearch",
			"onselect",
			"ondrag",
			"ondrop",
			"ondragstart",
			"ondragend",
			"ondragover",
			"ondragenter",
			"ondragleave",
			"onscroll",
			"onwheel",
			"oncopy",
			"oncut",
			"onpaste",
		],
	});
}
