import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
	useLocation,
	useNavigationType,
	createRoutesFromChildren,
	matchRoutes,
} from "react-router";

/**
 * Initialise Sentry for error tracking and performance monitoring
 *
 * This function should be called before React renders to ensure all errors are captured.
 * It integrates with React Router v7 for automatic route tracking and performance monitoring.
 */
export function initSentry() {
	// Only initialise if DSN is configured
	const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

	// Derive Sentry environment at runtime so one build works for both staging
	// and production. Uses hostname detection — runtime detection always wins.
	const deriveEnvironment = (): string => {
		if (typeof window !== "undefined") {
			const host = window.location.hostname;
			if (
				host.includes("-test.") ||
				host.includes("localhost") ||
				host.includes("127.0.0.1")
			) {
				return "test";
			}
			return "production";
		}
		// Non-browser context (tests, SSR)
		return "development";
	};
	const sentryEnvironment = deriveEnvironment();

	if (!sentryDsn) {
		console.warn("Sentry DSN not configured - error tracking disabled");
		return;
	}

	Sentry.init({
		dsn: sentryDsn,
		environment: sentryEnvironment,

		integrations: [
			// React Router v7 browser tracing integration
			Sentry.reactRouterV7BrowserTracingIntegration({
				useEffect,
				useLocation,
				useNavigationType,
				createRoutesFromChildren,
				matchRoutes,
			}),

			// Session replay for debugging
			Sentry.replayIntegration({
				maskAllText: true,
				blockAllMedia: true,
			}),
		],

		// Performance monitoring
		tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0, // 10% in production, 100% in development

		// Session replay sampling
		replaysSessionSampleRate: 0.1, // 10% of sessions
		replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

		// Additional configuration
		beforeSend(event) {
			// Don't send events in development unless explicitly enabled
			if (import.meta.env.DEV && !import.meta.env.VITE_SENTRY_DEBUG) {
				return null;
			}

			// Drop a known, harmless crash inside the bundled web-vitals
			// instrumentation. After a soft navigation a queued performance-entry
			// callback can run on idle once the entry has already been cleared,
			// producing "Cannot read properties of undefined (reading 'startTime')"
			// in reportAllChanges. This is an upstream library defect that does not
			// affect the application, so we suppress it rather than report noise.
			const containsWebVitalsStartTimeError = event.exception?.values?.some(
				(value) =>
					value.type === "TypeError" &&
					typeof value.value === "string" &&
					value.value.includes("reading 'startTime'")
			);
			if (containsWebVitalsStartTimeError) {
				return null;
			}

			return event;
		},
	});
}
