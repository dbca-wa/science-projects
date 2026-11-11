# Projects Feature

The projects feature is the largest feature in the Science Projects Management System (SPMS), managing all project-related functionality including project creation, editing, team management, document workflows, comments, and map visualisation.

## Overview

This feature handles:

- Project creation via multi-step wizard
- Project listing, filtering, and search
- Project detail views with tabbed interface
- Team member management
- Document workflows (Concept Plans, Project Plans, Progress Reports, Student Reports, Project Closures)
- Comment system with rich text, mentions, and reactions
- Interactive map visualisation with clustering and heatmaps
- Project permissions and approval workflows

## Directory Structure

```
features/projects/
├── components/          # React components organised by subdomain
│   ├── badges/         # Status and kind badges
│   ├── cards/          # Project card displays
│   ├── comments/       # Comment system (21 files)
│   ├── form/           # Project editing forms
│   ├── images/         # Project image components
│   ├── keywords/       # Keywords management
│   ├── list/           # Project listing and filtering
│   ├── map/            # Map visualisation (19 files)
│   ├── modals/         # Modal dialogs
│   ├── overview/       # Overview tab components
│   ├── placeholders/   # Loading and empty states
│   ├── tabs/           # Document tab components
│   ├── team/           # Team management (10 files)
│   └── wizard/         # Project creation wizard
│       ├── steps/      # Wizard step components
│       ├── map/        # Wizard map components
│       └── validation/ # Wizard validation logic
├── hooks/              # Custom React hooks and TanStack Query hooks
├── services/           # API services and endpoints
│   ├── comment.service.ts
│   ├── comment.endpoints.ts
│   ├── document.service.ts
│   ├── document.endpoints.ts
│   ├── pdf.service.ts
│   ├── pdf.endpoints.ts
│   ├── project.service.ts
│   ├── project.endpoints.ts
│   ├── reaction.service.ts
│   ├── reaction.endpoints.ts
│   ├── team.service.ts
│   └── team.endpoints.ts
├── types/              # TypeScript type definitions
│   ├── comment.types.ts
│   ├── document.types.ts
│   ├── map.types.ts
│   ├── project.types.ts
│   ├── team.types.ts
│   └── wizard.types.ts
└── utils/              # Utility functions organised by domain
    ├── permissions/    # Permission checking utilities
    ├── map/           # Map-related utilities
    ├── team/          # Team management utilities
    ├── authors/       # Author and approval utilities
    ├── comments/      # Comment utilities
    ├── project.utils.ts
    ├── year.utils.ts
    └── caretaker-admin.utils.ts
```

## Component Organisation

### Badge Components (`components/badges/`)

Visual indicators for project status and kind:

- `ProjectKindBadge` - Displays project kind (Core Function, Science, Student, External)
- `ProjectStatusBadge` - Displays project status (New, Active, Completed, etc.)
- `ProjectTag` - Generic tag display for projects

### Card Components (`components/cards/`)

Card-based project displays:

- `ProjectCard` - Main project card for lists and grids
- `ProjectDetailsCard` - Detailed project information card
- `ProjectTypeCard` - Project type selection card (wizard)

### Comments System (`components/comments/`)

Rich comment system with 21 files:

- `CommentSection` - Main comment section container
- `CommentList` - List of comments with threading
- `CommentCard` - Individual comment display
- `CommentForm` - Comment creation/editing form
- `CommentRichTextEditor` - Rich text editor for comments
- `MentionInput` / `MentionDisplay` - User mention functionality
- `ReactionPicker` / `ReactionDisplay` - Emoji reactions

### Form Components (`components/form/`)

Project editing forms:

- `EditProjectButton` - Button to trigger project editing
- `EditProjectForm` - Main project edit form

### Image Components (`components/images/`)

Project image handling:

- `ProjectImage` - Basic project image display
- `ProjectImageWithTag` - Project image with overlay tag

### Keywords Components (`components/keywords/`)

Keywords management:

- `ProjectKeywords` - Keywords display component
- `ProjectKeywordsSection` - Keywords section with edit capability
- `KeywordsEditModal` - Modal for editing keywords

### List Components (`components/list/`)

Project listing and filtering:

- `ProjectList` - List view of projects
- `ProjectFilters` - Filter controls for project lists
- `ProjectsDataTable` - Table view of projects
- `DownloadProjectsCSVButton` - CSV export functionality

### Map System (`components/map/`)

Interactive map with 19 files:

- `FullMapContainer` - Main map container with all features
- `BasicMap` - Simple map display
- `ProjectMarker` - Individual project markers
- `ProjectPopup` - Popup for project details
- `HeatmapLayer` - Heatmap visualisation
- `MapControls` - Map control buttons
- `MapFilters` - Map-specific filters

### Wizard System (`components/wizard/`)

Multi-step project creation wizard:

- `WizardContainer` - Main wizard orchestrator
- `WizardLayout` - Wizard layout wrapper
- `WizardNavigation` - Navigation controls
- `WizardStepper` - Step indicator
- `steps/` - Individual wizard steps
  - `BaseInformationStep` - Basic project info
  - `ProjectDetailsStep` - Detailed project info
  - `LocationStep` - Location selection
  - `StudentDetailsStep` - Student project details
  - `ExternalDetailsStep` - External project details

## Service Layer Pattern

Services follow the pattern: `[domain].service.ts` + `[domain].endpoints.ts`

**Service files** contain business logic and API calls:

```typescript
// services/comment.service.ts
export const getComments = async (documentId: number): Promise<IComment[]> => {
	return apiClient.get<IComment[]>(COMMENT_ENDPOINTS.LIST(documentId));
};
```

**Endpoint files** define API endpoint URLs:

```typescript
// services/comment.endpoints.ts
export const COMMENT_ENDPOINTS = {
	LIST: (documentId: number) =>
		`/communications/comments?document_id=${documentId}`,
	CREATE: () => `/communications/comments`,
} as const;
```

## Type Organisation

Types are organised by domain:

- `comment.types.ts` - Comment and reaction types
- `document.types.ts` - Document types (re-exports from shared)
- `map.types.ts` - Map-related types (GeoJSON, markers, etc.)
- `project.types.ts` - Core project types (re-exports from shared + project-specific)
- `team.types.ts` - Team member and permission types
- `wizard.types.ts` - Wizard form and validation types

## Utility Organisation

Utilities are grouped by domain:

### Permissions (`utils/permissions/`)

- `project-permissions.utils.ts` - Project-level permissions
- `comment-permissions.utils.ts` - Comment permissions
- `team-permissions.utils.ts` - Team management permissions

### Map (`utils/map/`)

- `clustering.utils.ts` - Marker clustering logic
- `coordinate-calculation.utils.ts` - Coordinate transformations
- `marker-color.utils.ts` - Marker colour logic
- `marker-creation.utils.ts` - Marker creation and configuration

### Team (`utils/team/`)

- `team.utils.ts` - Team member operations and sorting
- Re-exports team permissions

### Authors (`utils/authors/`)

- `authors.utils.ts` - Author display and formatting
- `approval.utils.ts` - Approval workflow utilities

### Comments (`utils/comments/`)

- `comment-html.utils.ts` - HTML sanitisation and formatting
- Re-exports comment permissions

## Common Development Tasks

### Adding a New Component

1. Determine the component's subdomain (badges, cards, list, etc.)
2. Create the component file in the appropriate subdirectory
3. Export from the subdirectory's `index.ts`
4. The main `components/index.ts` will automatically re-export it

```typescript
// components/badges/MyNewBadge.tsx
export const MyNewBadge = () => {
	/* ... */
};

// components/badges/index.ts
export { MyNewBadge } from "./MyNewBadge";

// Usage elsewhere
import { MyNewBadge } from "@/features/projects/components";
```

### Adding a New Service

1. Create `[domain].service.ts` with business logic
2. Create `[domain].endpoints.ts` with endpoint definitions
3. Export from `services/index.ts`

```typescript
// services/mydomain.endpoints.ts
export const MYDOMAIN_ENDPOINTS = {
	LIST: () => `/mydomain`,
	DETAIL: (id: number) => `/mydomain/${id}`,
} as const;

// services/mydomain.service.ts
import { apiClient } from "@/shared/services/api/client.service";
import { MYDOMAIN_ENDPOINTS } from "./mydomain.endpoints";

export const getItems = async () => {
	return apiClient.get(MYDOMAIN_ENDPOINTS.LIST());
};

// services/index.ts
export * from "./mydomain.service";
export * from "./mydomain.endpoints";
```

### Adding a New Type

1. Determine if the type is project-specific or should be in shared
2. Add to the appropriate type file or create a new one
3. Use the `I[TypeName]` naming convention for interfaces

```typescript
// types/project.types.ts
export interface IMyNewType {
	id: number;
	name: string;
}
```

### Adding a New Utility

1. Determine the utility's domain (permissions, map, team, etc.)
2. Create or add to the appropriate utility file
3. Export from the subdirectory's `index.ts`

```typescript
// utils/team/team.utils.ts
export function sortTeamMembers(members: ITeamMember[]) {
	// Implementation
}

// utils/team/index.ts
export * from "./team.utils";
```

## Project-Specific Patterns

### Permission Checking

Always use the permission utilities from `utils/permissions/`:

```typescript
import { canEditProject } from "@/features/projects/utils/permissions";

const hasPermission = canEditProject(currentUser, project);
```

### Team Management

Team operations use the team service and utilities:

```typescript
import { useProjectTeam } from "@/features/projects/hooks";
import { sortTeamMembersByPosition } from "@/features/projects/utils/team";

const { data: members } = useProjectTeam(projectId);
const sortedMembers = sortTeamMembersByPosition(members);
```

### Document Workflows

Document actions use the document service:

```typescript
import { useDocumentAction } from "@/features/projects/hooks/useDocumentAction";

const { mutate: performAction } = useDocumentAction(documentType, documentId);
performAction({ action: "approve", send_email: true });
```

## Architecture Guidelines

### Import Rules

- Projects is a domain feature and should NOT import from other domain features (caretakers, etc.)
- Projects CAN import from platform features (auth, users) and shared
- Exception: Dashboard can import from projects

### Public API Components

These components are exported for use by other features:

- `ProjectCard`
- `ProjectStatusBadge`
- `ProjectKindBadge`
- `ProjectImage`

### Internal Components

These components are internal to projects and should NOT be imported by other features:

- Comments system
- Map system
- Team management
- Document tabs
- Wizard
