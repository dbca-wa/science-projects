// This file co-locates route guard components with small module-level
// constants (division slugs, dev flag). react-refresh/only-export-components
// flags the mixed exports, but these constants are not hot-reloadable state
// and splitting them out would fragment cohesive guard logic.
/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import { Navigate, useLocation } from "react-router";
import { observer } from "mobx-react-lite";
import { useAuthStore } from "@/app/stores/store-context";
import { useDivisions } from "@/shared/hooks/queries/useDivisions";
import { useCurrentUser } from "@/features/auth";
import { toast } from "sonner";

/** Division slugs that grant AR admin access to key stakeholders */
const AR_ENABLED_DIVISION_SLUGS = ["BCS"];

const IS_LOCAL_DEV = import.meta.env.DEV;

/**
 * UnauthenticatedFallback - Shows a blank page in non-dev environments.
 * In staging/production, SSO handles authentication automatically.
 * If the backend is down, the user sees a clean white page instead of
 * a login form. They can refresh when ready.
 */
const UnauthenticatedFallback = () => {
	return (
		<div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
			<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" />
		</div>
	);
};

/**
 * Protected Route Guard
 * - Checks if auth store is initialised
 * - Shows loading spinner while initialising
 * - In non-dev environments: shows blank recovery page if not authenticated
 *   (SSO handles re-auth, or backend may be temporarily down)
 * - In local dev: redirects to login page
 * - Preserves original location in redirect state
 * - Renders children if authenticated
 */
export const ProtectedRoute = observer(
	({ children }: { children: React.ReactNode }) => {
		const authStore = useAuthStore();
		const location = useLocation();

		// Show loading spinner while initialising from cookies
		if (!authStore.state.initialised) {
			return (
				<div className="min-h-screen flex items-center justify-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
				</div>
			);
		}

		// Not authenticated
		if (!authStore.isAuthenticated) {
			// In local dev, redirect to login form
			if (IS_LOCAL_DEV) {
				return <Navigate to="/login" state={{ from: location }} replace />;
			}
			// In staging/production, show blank page (SSO handles re-auth)
			return <UnauthenticatedFallback />;
		}

		// Render children if authenticated
		return <>{children}</>;
	}
);

/**
 * Admin-Only Route Guard
 * Redirects to home if user is not an admin
 * Waits for user data to be loaded before checking admin status
 */
export const AdminRoute = observer(
	({ children }: { children: React.ReactNode }) => {
		const authStore = useAuthStore();
		const location = useLocation();

		if (!authStore.isAuthenticated) {
			if (IS_LOCAL_DEV) {
				return <Navigate to="/login" state={{ from: location }} replace />;
			}
			return <UnauthenticatedFallback />;
		}

		// Wait for user data to be loaded
		if (!authStore.user) {
			return (
				<div className="min-h-screen flex items-center justify-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
				</div>
			);
		}

		if (!authStore.isSuperuser) {
			// Logged in but not admin - redirect to home with message
			toast.error("You don't have permission to access this page");
			return <Navigate to="/" replace />;
		}

		return <>{children}</>;
	}
);

ProtectedRoute.displayName = "ProtectedRoute";
AdminRoute.displayName = "AdminRoute";

/**
 * Inner component that checks key_stakeholder status using hooks.
 * Separated from the observer wrapper so hooks can be called unconditionally.
 */
const KeyStakeholderCheck = ({ children }: { children: React.ReactNode }) => {
	const { data: currentUser } = useCurrentUser();
	const { data: divisions, isLoading } = useDivisions();

	const isKeyStakeholder = useMemo(() => {
		if (!currentUser || !divisions) return false;
		return divisions.some(
			(d) =>
				AR_ENABLED_DIVISION_SLUGS.includes(d.slug) &&
				d.key_stakeholder?.id === currentUser.id
		);
	}, [currentUser, divisions]);

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
			</div>
		);
	}

	if (!isKeyStakeholder) {
		toast.error("You don't have permission to access this page");
		return <Navigate to="/" replace />;
	}

	return <>{children}</>;
};

/**
 * Admin or Key Stakeholder Route Guard
 * Allows access if user is superuser OR key_stakeholder of an AR-enabled division.
 * Used for AR admin pages (batch approve, new cycle, report info).
 */
export const AdminOrKeyStakeholderRoute = observer(
	({ children }: { children: React.ReactNode }) => {
		const authStore = useAuthStore();
		const location = useLocation();

		if (!authStore.isAuthenticated) {
			if (IS_LOCAL_DEV) {
				return <Navigate to="/login" state={{ from: location }} replace />;
			}
			return <UnauthenticatedFallback />;
		}

		if (!authStore.user) {
			return (
				<div className="min-h-screen flex items-center justify-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
				</div>
			);
		}

		// Superusers always have access
		if (authStore.isSuperuser) {
			return <>{children}</>;
		}

		// Check if user is key_stakeholder of an AR-enabled division
		return <KeyStakeholderCheck>{children}</KeyStakeholderCheck>;
	}
);

AdminOrKeyStakeholderRoute.displayName = "AdminOrKeyStakeholderRoute";
