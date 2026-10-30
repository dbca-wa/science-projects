import { describe, it, expect } from "vitest";
import {
	sanitizeInput,
	sanitizeUrl,
	sanitizeRichText,
	toPlainText,
} from "./sanitise.utils";

describe("sanitise.utils", () => {
	describe("sanitizeInput", () => {
		it("should remove all HTML tags", () => {
			const input = "<script>alert('XSS')</script>Hello";
			const result = sanitizeInput(input);
			expect(result).toBe("Hello");
			expect(result).not.toContain("<");
		});

		it("should remove safe HTML tags too", () => {
			const input = "<p>Hello <strong>world</strong></p>";
			const result = sanitizeInput(input);
			expect(result).toBe("Hello world");
			expect(result).not.toContain("<");
		});

		it("should preserve plain text", () => {
			const input = "Just plain text";
			const result = sanitizeInput(input);
			expect(result).toBe("Just plain text");
		});
	});

	describe("toPlainText", () => {
		it("removes tags and decodes entities", () => {
			expect(toPlainText("<p>Fish &amp; fauna <em>survey</em></p>")).toBe(
				"Fish & fauna survey"
			);
		});

		it("keeps escaped markup as text", () => {
			expect(toPlainText("<p>&lt;b&gt;not bold&lt;/b&gt;</p>")).toBe(
				"<b>not bold</b>"
			);
		});

		it("collapses whitespace, including non-breaking spaces", () => {
			expect(
				toPlainText(
					"<p>&nbsp;</p>\n<p><span>&nbsp;</span>Aluta&nbsp; quadrata</p>"
				)
			).toBe("Aluta quadrata");
		});

		it("drops script and style content", () => {
			expect(
				toPlainText("<script>alert(1)</script><style>p{}</style>Title")
			).toBe("Title");
		});

		it("returns an empty string for empty input", () => {
			expect(toPlainText("")).toBe("");
			expect(toPlainText(null)).toBe("");
			expect(toPlainText(undefined)).toBe("");
		});
	});

	describe("sanitizeUrl", () => {
		it("should allow https URLs", () => {
			const url = "https://example.com";
			const result = sanitizeUrl(url);
			expect(result).toBe("https://example.com/");
		});

		it("should allow http URLs", () => {
			const url = "http://example.com";
			const result = sanitizeUrl(url);
			expect(result).toBe("http://example.com/");
		});

		it("should allow mailto URLs", () => {
			const url = "mailto:test@example.com";
			const result = sanitizeUrl(url);
			expect(result).toBe("mailto:test@example.com");
		});

		it("should add https:// to URLs without protocol", () => {
			const url = "example.com";
			const result = sanitizeUrl(url);
			expect(result).toBe("https://example.com/");
		});

		it("should block javascript: protocol", () => {
			const malicious = "javascript:alert('XSS')";
			const result = sanitizeUrl(malicious);
			expect(result).toBe("");
		});

		it("should block data: protocol", () => {
			const malicious = "data:text/html,<script>alert('XSS')</script>";
			const result = sanitizeUrl(malicious);
			expect(result).toBe("");
		});

		it("should block vbscript: protocol", () => {
			const malicious = "vbscript:msgbox('XSS')";
			const result = sanitizeUrl(malicious);
			expect(result).toBe("");
		});

		it("should return empty string for invalid URLs", () => {
			const invalid = "not a url";
			const result = sanitizeUrl(invalid);
			expect(result).toBe("");
		});
	});

	describe("sanitizeRichText", () => {
		it("should allow more tags than basic sanitisation", () => {
			const richText =
				'<div><span class="highlight">Text</span><img src="image.jpg" alt="Image" /></div>';
			const result = sanitizeRichText(richText);
			expect(result).toContain("<div>");
			expect(result).toContain("<span");
			expect(result).toContain("<img");
		});

		it("should still remove script tags", () => {
			const malicious = '<div><script>alert("XSS")</script><p>Safe</p></div>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("script");
			expect(result).toContain("<p>Safe</p>");
		});

		it("should remove script tags with variations (CodeQL fix)", () => {
			const variations = [
				"<script>alert(1)</script>",
				"<script >alert(1)</script>",
				"<script>alert(1)</script >",
				"<SCRIPT>alert(1)</SCRIPT>",
			];

			variations.forEach((malicious) => {
				const result = sanitizeRichText(malicious);
				expect(result).not.toContain("script");
				expect(result).not.toContain("SCRIPT");
				expect(result).not.toContain("alert");
			});
		});

		it("should remove all event handler attributes (CodeQL fix)", () => {
			const handlers = [
				'<div onclick="alert(1)">Click</div>',
				'<div onerror="alert(1)">Error</div>',
				'<div onload="alert(1)">Load</div>',
				'<div onmouseover="alert(1)">Hover</div>',
			];

			handlers.forEach((malicious) => {
				const result = sanitizeRichText(malicious);
				expect(result).not.toContain("onclick");
				expect(result).not.toContain("onerror");
				expect(result).not.toContain("onload");
				expect(result).not.toContain("onmouseover");
				expect(result).toContain("<div>");
			});
		});

		it("should remove javascript: protocol (CodeQL fix)", () => {
			const malicious = '<a href="javascript:alert(1)">Link</a>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("javascript:");
		});

		it("should remove data: protocol (CodeQL fix)", () => {
			const malicious =
				'<a href="data:text/html,<script>alert(1)</script>">Link</a>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("data:");
		});

		it("should remove vbscript: protocol (CodeQL fix)", () => {
			const malicious = '<a href="vbscript:msgbox(1)">Link</a>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("vbscript:");
		});

		it("should allow table elements", () => {
			const table =
				"<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>";
			const result = sanitizeRichText(table);
			expect(result).toContain("<table>");
			expect(result).toContain("<thead>");
			expect(result).toContain("<tbody>");
		});

		it("should preserve safe HTML structure", () => {
			const safe = "<p><strong>Bold</strong> and <em>italic</em></p>";
			const result = sanitizeRichText(safe);
			expect(result).toBe("<p><strong>Bold</strong> and <em>italic</em></p>");
		});

		it("should preserve b tags (Word Desktop bold)", () => {
			const html = "<p><b>Bold text</b> normal</p>";
			const result = sanitizeRichText(html);
			expect(result).toContain("<b>");
			expect(result).toContain("Bold text");
		});

		it("should preserve i tags (Word Desktop italic)", () => {
			const html = "<p><i>Italic text</i> normal</p>";
			const result = sanitizeRichText(html);
			expect(result).toContain("<i>");
			expect(result).toContain("Italic text");
		});

		it("should preserve b tags with style attribute", () => {
			const html = '<p><b style="font-weight: bold">Bold</b></p>';
			const result = sanitizeRichText(html);
			expect(result).toContain("<b");
			expect(result).toContain("Bold");
		});

		it("should preserve nested b and i tags", () => {
			const html = "<p><b><i>Bold italic</i></b></p>";
			const result = sanitizeRichText(html);
			expect(result).toContain("<b>");
			expect(result).toContain("<i>");
			expect(result).toContain("Bold italic");
		});

		it("should preserve existing strong and em tags unchanged", () => {
			const html = "<p><strong>Bold</strong> and <em>italic</em></p>";
			const result = sanitizeRichText(html);
			expect(result).toBe("<p><strong>Bold</strong> and <em>italic</em></p>");
		});

		it("should handle empty input", () => {
			expect(sanitizeRichText("")).toBe("");
		});

		it("should remove iframe tags", () => {
			const malicious = '<iframe src="evil.com"></iframe><p>Safe</p>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("iframe");
			expect(result).toContain("<p>Safe</p>");
		});

		it("should remove object and embed tags", () => {
			const malicious =
				'<object data="evil.swf"></object><embed src="evil.swf"><p>Safe</p>';
			const result = sanitizeRichText(malicious);
			expect(result).not.toContain("object");
			expect(result).not.toContain("embed");
			expect(result).toContain("<p>Safe</p>");
		});
	});
});
