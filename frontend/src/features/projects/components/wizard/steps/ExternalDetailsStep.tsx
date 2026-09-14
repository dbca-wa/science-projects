import { observer } from "mobx-react-lite";
import { useProjectWizardStore } from "@/app/stores/store-context";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { RichTextEditor } from "@/shared/components/editor/RichTextEditor";
import { Building2, DollarSign } from "lucide-react";
import { AffiliationCombobox } from "@/shared/components/AffiliationCombobox";
import type { IAffiliation } from "@/shared/types/org.types";
import { useState, useEffect, useCallback, memo } from "react";
import { FieldError } from "../FieldError";
import { shouldShowError } from "../validation-helpers";

/**
 * Stable RTE wrapper — memoised so it never re-renders from parent
 * observer updates. Prevents Lexical focus loss.
 */
// eslint-disable-next-line react-refresh/only-export-components
const StableAimsEditor = memo(
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
			placeholder="List out the aims of your project..."
			toolbar="simple"
			minHeight="150px"
			aria-label="External project aims"
			className="editor-standalone"
		/>
	),
	() => true
);
StableAimsEditor.displayName = "StableAimsEditor";

/**
 * ExternalDetailsStep - Step 4 of project creation wizard (conditional)
 *
 * Only shown when project kind is "external".
 * Updates the MobX store directly. RTE components use stable memo wrappers
 * to prevent focus loss during typing.
 */
const ExternalDetailsStep = observer(() => {
	const wizardStore = useProjectWizardStore();
	const formData = wizardStore.state.editingFormData.externalDetails;
	const validation = wizardStore.state.validation[3];
	const stepIndex = 3;
	const [selectedAffiliations, setSelectedAffiliations] = useState<
		IAffiliation[]
	>([]);

	// If external details is null, initialise it
	if (!formData) {
		wizardStore.setExternalDetails({
			collaboration_with: "",
			budget: "",
			aims: "",
		});
		return null;
	}

	// Parse collaboration_with string into affiliations array on mount
	useEffect(() => {
		const collaborationWith = formData?.collaboration_with || "";
		if (collaborationWith && selectedAffiliations.length === 0) {
			const names = collaborationWith.split("; ").filter((n) => n.trim());
			const affiliations = names.map((name, index) => ({
				id: -index - 1,
				name: name.trim(),
			})) as IAffiliation[];
			setSelectedAffiliations(affiliations);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleAffiliationsChange = useCallback(
		(affiliations: IAffiliation[]) => {
			setSelectedAffiliations(affiliations);
			const collaborationString = affiliations.map((a) => a.name).join("; ");
			wizardStore.setExternalDetails({
				collaboration_with: collaborationString,
			});
		},
		[wizardStore]
	);

	// Validate on every form data change
	useEffect(() => {
		if (!formData) return;

		const errors: Record<string, string> = {};

		if (
			!formData.collaboration_with ||
			formData.collaboration_with.trim() === ""
		) {
			errors.collaboration_with =
				"At least one collaboration partner is required";
		}

		const isValid = Object.keys(errors).length === 0;
		wizardStore.setStepValidation(3, isValid, errors);
	}, [formData?.collaboration_with, wizardStore, formData]);

	const handleBudgetChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			wizardStore.setExternalDetails({ budget: e.target.value });
		},
		[wizardStore]
	);

	const handleAimsChange = useCallback(
		(html: string) => {
			wizardStore.setExternalDetails({ aims: html });
		},
		[wizardStore]
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="space-y-2">
				<h3 className="text-lg font-semibold">External Partnership Details</h3>
				<p className="text-sm text-muted-foreground">
					Provide information about the external organisations and partnership
					details for this project.
				</p>
			</div>

			{/* Collaboration With */}
			<div className="space-y-2">
				<AffiliationCombobox
					multiple
					values={selectedAffiliations}
					onChangeMultiple={handleAffiliationsChange}
					label="Collaboration With"
					placeholder="Search for or add a collaboration partner"
					helperText="The entity/s this project is in collaboration with"
					isRequired={true}
					showIcon={true}
				/>
				<FieldError
					error={
						shouldShowError(wizardStore, "collaboration_with", stepIndex)
							? validation?.errors.collaboration_with
							: undefined
					}
				/>
			</div>

			{/* Budget */}
			<div className="space-y-2">
				<Label htmlFor="budget">Budget (Optional)</Label>
				<div className="relative">
					<DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						id="budget"
						type="number"
						inputMode="numeric"
						min="0"
						value={formData.budget}
						onChange={handleBudgetChange}
						placeholder="The estimated operating budget in dollars..."
						className="pl-9 text-base"
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					The estimated budget for the project in dollars
				</p>
			</div>

			{/* Aims */}
			<div className="space-y-2">
				<Label htmlFor="aims">Aims (Optional)</Label>
				<StableAimsEditor
					initialValue={formData.aims}
					onChange={handleAimsChange}
				/>
				<p className="text-xs text-muted-foreground">
					List out the aims of your project
				</p>
			</div>

			{/* Info Box */}
			<div className="rounded-lg border bg-muted/50 p-4">
				<div className="flex gap-3">
					<div className="flex-shrink-0">
						<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
							<Building2 className="h-4 w-4 text-primary" />
						</div>
					</div>
					<div className="space-y-1">
						<p className="text-sm font-medium">External Partnership Project</p>
						<p className="text-xs text-muted-foreground">
							This information will be used to establish the partnership
							relationship and document the collaboration details throughout the
							project lifecycle.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
});

export { ExternalDetailsStep };
