#!/usr/bin/env python3
"""Compare Grype or Trivy JSON results for a candidate image against a baseline.

A finding is new when its (vulnerability id, package) pair is absent from the
baseline. Version changes of a package that already had the vulnerability do
not make the finding new. The module depends only on the standard library so
the same file can be copied into a repository's ``.github/scripts`` directory.

Exit status of the command line interface: 0 when nothing blocks, 1 when new
findings at or above the minimum severity exist, 2 on usage or input errors.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SEVERITY_ORDER = {
    "UNKNOWN": 0,
    "NEGLIGIBLE": 1,
    "LOW": 2,
    "MEDIUM": 3,
    "HIGH": 4,
    "CRITICAL": 5,
}


OS_PACKAGE_TYPES = {"deb", "apk", "rpm"}


@dataclass(frozen=True)
class Finding:
    scanner: str
    vulnerability_id: str
    package: str
    installed_version: str
    severity: str
    fixed_version: str
    # "os" for distribution packages (fixed by rebuilding with apt/apk
    # upgrades), "app" for language and binary packages (fixed by bumping a
    # dependency or base image tag).
    origin: str = "app"

    @property
    def key(self) -> tuple[str, str]:
        return (self.vulnerability_id, self.package)

    @property
    def fixable(self) -> bool:
        return self.fixed_version not in ("", "N/A")


def _severity(value: Any) -> str:
    text = str(value or "UNKNOWN").upper()
    return text if text in SEVERITY_ORDER else "UNKNOWN"


def parse_grype(data: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for match in data.get("matches") or []:
        vulnerability = match.get("vulnerability") or {}
        artifact = match.get("artifact") or {}
        fix_versions = (vulnerability.get("fix") or {}).get("versions") or []
        findings.append(
            Finding(
                scanner="grype",
                vulnerability_id=str(vulnerability.get("id", "")),
                package=str(artifact.get("name", "")),
                installed_version=str(artifact.get("version", "")),
                severity=_severity(vulnerability.get("severity")),
                fixed_version=str(fix_versions[0]) if fix_versions else "",
                origin="os" if artifact.get("type") in OS_PACKAGE_TYPES else "app",
            )
        )
    return findings


def parse_trivy(data: dict[str, Any]) -> list[Finding]:
    findings: list[Finding] = []
    for result in data.get("Results") or []:
        origin = "os" if result.get("Class") == "os-pkgs" else "app"
        for vuln in result.get("Vulnerabilities") or []:
            findings.append(
                Finding(
                    scanner="trivy",
                    vulnerability_id=str(vuln.get("VulnerabilityID", "")),
                    package=str(vuln.get("PkgName", "")),
                    installed_version=str(vuln.get("InstalledVersion", "")),
                    severity=_severity(vuln.get("Severity")),
                    fixed_version=str(vuln.get("FixedVersion") or ""),
                    origin=origin,
                )
            )
    return findings


PARSERS = {"grype": parse_grype, "trivy": parse_trivy}


def load_findings(scanner: str, path: Path) -> list[Finding]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return PARSERS[scanner](data)


def at_least(severity: str, minimum: str) -> bool:
    return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minimum]


@dataclass
class DiffResult:
    new: list[Finding]
    resolved: list[Finding]
    baseline_total: int
    candidate_total: int

    def blocking(self, minimum: str = "HIGH", only_fixable: bool = False) -> list[Finding]:
        return [
            f
            for f in self.new
            if at_least(f.severity, minimum) and (f.fixable or not only_fixable)
        ]


def diff(baseline: list[Finding], candidate: list[Finding]) -> DiffResult:
    baseline_keys = {f.key for f in baseline}
    candidate_keys = {f.key for f in candidate}
    new = sorted(
        {f.key: f for f in candidate if f.key not in baseline_keys}.values(),
        key=lambda f: (-SEVERITY_ORDER[f.severity], f.vulnerability_id, f.package),
    )
    resolved = sorted(
        {f.key: f for f in baseline if f.key not in candidate_keys}.values(),
        key=lambda f: (-SEVERITY_ORDER[f.severity], f.vulnerability_id, f.package),
    )
    return DiffResult(
        new=new,
        resolved=resolved,
        baseline_total=len(baseline_keys),
        candidate_total=len(candidate_keys),
    )


def render_markdown(
    title: str, result: DiffResult, minimum: str, only_fixable: bool
) -> str:
    blocking = result.blocking(minimum, only_fixable)
    lines = [
        f"### {title}",
        "",
        f"- Baseline findings: {result.baseline_total}",
        f"- Candidate findings: {result.candidate_total}",
        f"- New: {len(result.new)} (blocking at {minimum}+: {len(blocking)})",
        f"- Resolved: {len(result.resolved)}",
        "",
    ]
    if blocking:
        lines += [
            "| Vulnerability | Package | Installed | Fixed in | Severity |",
            "|---|---|---|---|---|",
        ]
        for f in blocking:
            fixed = f.fixed_version or "none"
            lines.append(
                f"| {f.vulnerability_id} | {f.package} | {f.installed_version} "
                f"| {fixed} | {f.severity} |"
            )
        lines.append("")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scanner", choices=sorted(PARSERS), required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument(
        "--baseline",
        type=Path,
        help="Baseline results. When omitted or missing, nothing blocks.",
    )
    parser.add_argument("--min-severity", default="HIGH", choices=sorted(SEVERITY_ORDER))
    parser.add_argument("--only-fixable", action="store_true")
    parser.add_argument("--title", default=None)
    parser.add_argument("--summary", type=Path, help="Append a markdown summary here.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    title = args.title or f"{args.scanner.capitalize()} comparison"
    try:
        candidate = load_findings(args.scanner, args.candidate)
    except (OSError, ValueError) as exc:
        print(f"Cannot read candidate results: {exc}", file=sys.stderr)
        return 2

    if args.baseline is None or not args.baseline.is_file():
        message = (
            f"### {title}\n\nNo baseline available. "
            f"Candidate findings: {len({f.key for f in candidate})}. Nothing blocks.\n"
        )
        print(message)
        if args.summary:
            with args.summary.open("a", encoding="utf-8") as handle:
                handle.write(message + "\n")
        return 0

    try:
        baseline = load_findings(args.scanner, args.baseline)
    except (OSError, ValueError) as exc:
        print(f"Cannot read baseline results: {exc}", file=sys.stderr)
        return 2

    result = diff(baseline, candidate)
    markdown = render_markdown(title, result, args.min_severity, args.only_fixable)
    print(markdown)
    if args.summary:
        with args.summary.open("a", encoding="utf-8") as handle:
            handle.write(markdown + "\n")
    return 1 if result.blocking(args.min_severity, args.only_fixable) else 0


if __name__ == "__main__":
    sys.exit(main())
