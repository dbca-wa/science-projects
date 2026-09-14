import { observer } from "mobx-react-lite";
import { useEffect, useCallback, memo } from "react";
import { useProjectWizardStore } from "@/app/stores/store-context";
import { Label } from "@/shared/components/ui/label";
import { ImageUpload } from "@/shared/components/media/ImageUpload";
import { RichTextEditor } from "@/shared/components/editor/RichTextEditor";
import { FormRichTextEditor } from "@/shared/components/editor/FormRichTextEditor";
import { KeywordInput } from "@/shared/components/KeywordInput";
import { isRichTextEmpty } from "@/shared/utils/rich-text.utils";
import { shouldShowError } from "../validation-helpers";
import { SectionCard } from "../SectionCard";

/**
 * Stable RTE wrappers — memoised so they never re-render from parent
 * observer updates. This prevents Lexical from losing focus when the
 * MobX store changes. The RTE manages its own internal state; onChange
 * pushes updates to the store without causing a re-render of this wrapper.
 */
// eslint-disable-next-line react-refresh/only-export-components
const StableTitleEditor = memo(
	({
		initialValue,
		onChange,
	}: {
		initialValue: string;
		onChange: (html: string) => void;
	}) => (
		<FormRichTextEditor
			value={initialValue}
			onChange={onChange}
			placeholder="Enter a descriptive title for your project"
			toolbar="projectTitle"
			minHeight="80px"
			aria-label="Project title"
		/>
	),
	// Never re-render — the RTE handles its own content internally
	() => true
);
StableTitleEditor.displayName = "StableTitleEditor";

// eslint-disable-next-line react-refresh/only-export-components
const StableDescriptionEditor = memo(
	({
		initialValue,
		onChange,
	}: {
		initialValue: string;
		onChange: (html: string) => void;
	}) => (
		<RichTextEditor
			value={initialValue}
			onChange={onChange}
			placeholder="A concise project summary, or any additional useful information..."
			toolbar="projectTitle"
			minHeight="200px"
			aria-label="Project summary"
			className="editor-standalone"
		/>
	),
	// Never re-render — the RTE handles its own content internally
	() => true
);
StableDescriptionEditor.displayName = "StableDescriptionEditor";

/**
 * BaseInformationStep - Step 1 of project creation wizard
 *
 * Collects:
 * - Title (required, max 150 chars)
 * - Description/Summary (required, rich text)
 * - Keywords (required, tag input)
 * - Image (optional, project image)
 *
 * Updates the MobX store directly on every change for live preview and
 * persistence. RTE components are wrapped in React.memo with a custom
 * comparator that always returns true (never re-render), preventing
 * Lexical from losing focus when the observer parent re-renders.
 */
const BaseInformationStep = observer(() => {
	const wizardStore = useProjectWizardStore();
	const formData = wizardStore.state.editingFormData.baseInformation;
	const validation = wizardStore.state.validation[0];
	const stepIndex = 0;

	const handleFieldBlur = useCallback(
		(fieldName: string) => {
			wizardStore.markFieldTouched(fieldName);
		},
		[wizardStore]
	);

	// Validate on every form data change
	useEffect(() => {
		const errors: Record<string, string> = {};

		if (isRichTextEmpty(formData.title)) {
			errors.title = "Title is required";
		}

		if (isRichTextEmpty(formData.description)) {
			errors.description = "Description is required";
		}

		if (!formData.keywords || formData.keywords.length === 0) {
			errors.keywords = "At least one keyword is required";
		}

		const isValid = Object.keys(errors).length === 0;
		wizardStore.setStepValidation(0, isValid, errors);
	}, [formData.title, formData.description, formData.keywords, wizardStore]);

	// Stable callbacks — these never change reference so the memo wrappers
	// don't need to care about them
	const handleTitleChange = useCallback(
		(html: string) => {
			wizardStore.setBaseInformation({ title: html });
		},
		[wizardStore]
	);

	const handleDescriptionChange = useCallback(
		(html: string) => {
			wizardStore.setBaseInformation({ description: html });
		},
		[wizardStore]
	);

	const handleImageChange = useCallback(
		(file: File | string | null) => {
			if (file instanceof File) {
				wizardStore.setBaseInformation({ image: file });
			} else if (file === null) {
				wizardStore.setBaseInformation({ image: null });
			}
		},
		[wizardStore]
	);

	const handleKeywordsChange = useCallback(
		(keywords: string[]) => {
			wizardStore.setBaseInformation({ keywords });
		},
		[wizardStore]
	);

	// Compute section completion states
	const isImageComplete = formData.image !== null;
	const isTitleValid = !isRichTextEmpty(formData.title);
	const isDescriptionValid = !isRichTextEmpty(formData.description);
	const isKeywordsValid = formData.keywords.length > 0;
	const isContentComplete =
		isTitleValid && isDescriptionValid && isKeywordsValid;

	// If the step was previously completed, show errors immediately (no need to touch fields)
	const wasCompleted = wizardStore.state.completedSteps.has(stepIndex);
	const showAllErrors = wasCompleted && !isContentComplete;

	// Content section is "invalid" if it was complete but now has errors
	const isContentInvalid = wasCompleted && !isContentComplete;

	return (
		<div className="space-y-6">
			{/* Image Section */}
			<SectionCard
				title="Project Image"
				isComplete={isImageComplete}
				completionLabel="Image section complete"
			>
				<div className="space-y-2">
					<Label htmlFor="image">Project Image (Optional)</Label>
					<ImageUpload
						value={formData.image}
						onChange={handleImageChange}
						variant="project"
						allowUrl={false}
						helperText="JPG or PNG only. Large photos are compressed automatically, so upload the original. Image will be used in project cards and annual reports."
					/>
				</div>
			</SectionCard>

			{/* Title + Description + Keywords Section */}
			<SectionCard
				title="Project Details"
				isComplete={isContentComplete}
				isInvalid={isContentInvalid}
				completionLabel="Project details section complete"
			>
				<div className="space-y-6">
					{/* Title */}
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Label htmlFor="title">
								Project Title <span className="text-destructive">*</span>
							</Label>
							{(showAllErrors ||
								shouldShowError(wizardStore, "title", stepIndex)) &&
								validation?.errors.title && (
									<span className="text-xs text-destructive font-medium">
										— {validation.errors.title}
									</span>
								)}
						</div>
						<StableTitleEditor
							initialValue={formData.title}
							onChange={handleTitleChange}
						/>
						<p className="text-xs text-muted-foreground">
							The project title with formatting if required (e.g. for taxonomic
							names)
						</p>
					</div>

					{/* Description/Summary */}
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Label htmlFor="description">
								Project Summary <span className="text-destructive">*</span>
							</Label>
							{(showAllErrors ||
								shouldShowError(wizardStore, "description", stepIndex)) &&
								validation?.errors.description && (
									<span className="text-xs text-destructive font-medium">
										— {validation.errors.description}
									</span>
								)}
						</div>
						<StableDescriptionEditor
							initialValue={formData.description}
							onChange={handleDescriptionChange}
						/>
						<p className="text-xs text-muted-foreground">
							A concise project summary, or any additional useful information
						</p>
					</div>

					{/* Keywords */}
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Label htmlFor="keywords">
								Keywords <span className="text-destructive">*</span>
							</Label>
							{(showAllErrors ||
								shouldShowError(wizardStore, "keywords", stepIndex)) &&
								validation?.errors.keywords && (
									<span className="text-xs text-destructive font-medium">
										— {validation.errors.keywords}
									</span>
								)}
						</div>
						<KeywordInput
							keywords={formData.keywords}
							onKeywordsChange={handleKeywordsChange}
							placeholder="Type a keyword and press Enter (use ; for multiple)"
							onBlur={() => handleFieldBlur("keywords")}
						/>
						<p className="text-xs text-muted-foreground">
							Add keywords to help others find your project. Use semicolons (;)
							to add multiple keywords at once.
						</p>
					</div>
				</div>
			</SectionCard>
		</div>
	);
});

export { BaseInformationStep };
