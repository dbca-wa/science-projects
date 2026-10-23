import { usePublications } from "../../hooks/usePublications";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Separator } from "@/shared/components/ui/separator";
import { comparePublications } from "../../utils/publications.utils";
import type { ILibraryPublication } from "../../types/staff-profile.types";

interface PublicationsSectionProps {
	employeeId?: string | null;
}

const PublicationsSection = ({ employeeId }: PublicationsSectionProps) => {
	const { data, isLoading, isError } = usePublications(employeeId ?? null);

	if (isLoading) {
		return (
			<div className="space-y-3 p-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Skeleton key={i} className="h-12 w-full" />
				))}
			</div>
		);
	}

	if (isError) {
		return (
			<div className="w-full p-4">
				<p className="text-lg font-semibold text-slate-900">Publications</p>
				<Separator className="mt-2 mb-3 bg-slate-200" />
				<p className="text-muted-foreground">
					Unable to load publications at this time. Please try again later.
				</p>
			</div>
		);
	}

	const docs = data?.libraryData?.docs ?? [];

	// Group by year, sorted descending
	const publicationsByYear = docs.reduce<Record<string, ILibraryPublication[]>>(
		(acc, pub) => {
			let year = pub.year;
			const bracketMatch = pub.year?.match(/\[(\d{4})\]/);
			if (bracketMatch?.[1]) year = bracketMatch[1];
			if (year && !isNaN(Number(year))) {
				if (!acc[year]) acc[year] = [];
				acc[year].push(pub);
			}
			return acc;
		},
		{}
	);

	// Within each year, order entries alphabetically by author text, then by title
	for (const year of Object.keys(publicationsByYear)) {
		publicationsByYear[year].sort(comparePublications);
	}

	const years = Object.keys(publicationsByYear)
		.map(Number)
		.filter((y) => !isNaN(y))
		.sort((a, b) => b - a);

	const totalCount = docs.length;

	return (
		<div className="w-full p-4 select-text">
			<p className="text-lg font-semibold text-slate-900">
				Publications{totalCount > 9 ? ` (${totalCount})` : ""}
			</p>
			<Separator className="mt-2 mb-3 bg-slate-200" />
			{docs.length === 0 ? (
				<p className="text-muted-foreground">No information recorded.</p>
			) : (
				<div className="space-y-6 mt-3">
					{years.map((year) => (
						<div key={year}>
							<p className="text-base font-semibold text-slate-800 mb-2">
								{year}
							</p>
							<div className="space-y-3">
								{publicationsByYear[String(year)].map((pub, idx) => (
									<PublicationEntry key={`${year}-${idx}`} publication={pub} />
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

const processPublicationText = (pub: ILibraryPublication): string => {
	const text = pub.BiblioText;
	if (pub.staff_only) {
		return text.replace(/<a\b[^>]*>.*?<\/a>\s*\.?\s*$/, "");
	}
	return text
		.replace(/\.\s*\./g, ".")
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim();
};

const PublicationEntry = ({
	publication,
}: {
	publication: ILibraryPublication;
}) => {
	const html = processPublicationText(publication);
	return (
		<div
			className="text-sm leading-relaxed text-slate-600 [&_a]:text-blue-500 [&_a]:no-underline hover:[&_a]:text-blue-700 hover:[&_a]:underline [&_i]:italic [&_i]:text-slate-500 [&_a_i]:text-inherit"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
};

export default PublicationsSection;
