#!/usr/bin/env python3
"""Tests for vuln_diff: how new scanner findings are detected and what blocks.

Runnable with `python3 .github/scripts/test_vuln_diff.py` (no pytest needed).
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import vuln_diff  # noqa: E402


def grype_match(vuln_id, pkg, version="1.0", severity="High", fixed=None):
    return {
        "vulnerability": {
            "id": vuln_id,
            "severity": severity,
            "fix": {"versions": [fixed] if fixed else []},
        },
        "artifact": {"name": pkg, "version": version},
    }


def trivy_vuln(vuln_id, pkg, version="1.0", severity="HIGH", fixed=None):
    vuln = {
        "VulnerabilityID": vuln_id,
        "PkgName": pkg,
        "InstalledVersion": version,
        "Severity": severity,
    }
    if fixed:
        vuln["FixedVersion"] = fixed
    return vuln


def trivy_doc(*vulns):
    return {"Results": [{"Vulnerabilities": list(vulns)}]}


class VulnDiffTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)

    def write(self, name, doc):
        path = self.dir / name
        path.write_text(json.dumps(doc), encoding="utf-8")
        return path

    def run_cli(self, scanner, baseline, candidate, *extra):
        args = ["--scanner", scanner, "--candidate", str(candidate), *extra]
        if baseline is not None:
            args += ["--baseline", str(baseline)]
        return vuln_diff.main(args)

    def test_parse_grype_and_trivy(self):
        grype = vuln_diff.parse_grype({"matches": [grype_match("CVE-1", "a", severity="Critical", fixed="2")]})
        self.assertEqual(grype[0].severity, "CRITICAL")
        self.assertTrue(grype[0].fixable)
        trivy = vuln_diff.parse_trivy(trivy_doc(trivy_vuln("CVE-2", "b")))
        self.assertFalse(trivy[0].fixable)
        self.assertEqual(vuln_diff.parse_trivy({}), [])
        self.assertEqual(vuln_diff.parse_grype({"matches": None}), [])

    def test_version_bump_of_known_vulnerability_is_not_new(self):
        old = vuln_diff.parse_grype({"matches": [grype_match("CVE-1", "a", version="1.0")]})
        new = vuln_diff.parse_grype({"matches": [grype_match("CVE-1", "a", version="1.1")]})
        self.assertEqual(vuln_diff.diff(old, new).new, [])

    def test_same_cve_in_other_package_is_new(self):
        old = vuln_diff.parse_grype({"matches": [grype_match("CVE-1", "a")]})
        new = vuln_diff.parse_grype({"matches": [grype_match("CVE-1", "a"), grype_match("CVE-1", "b")]})
        self.assertEqual([f.package for f in vuln_diff.diff(old, new).new], ["b"])

    def test_blocking_respects_severity_and_fixability(self):
        candidate = vuln_diff.parse_grype(
            {
                "matches": [
                    grype_match("CVE-1", "a", severity="Medium", fixed="2"),
                    grype_match("CVE-2", "b", severity="High"),
                    grype_match("CVE-3", "c", severity="Critical", fixed="3"),
                ]
            }
        )
        result = vuln_diff.diff([], candidate)
        self.assertEqual({f.vulnerability_id for f in result.blocking("HIGH")}, {"CVE-2", "CVE-3"})
        self.assertEqual(
            {f.vulnerability_id for f in result.blocking("HIGH", only_fixable=True)}, {"CVE-3"}
        )

    def test_cli_blocks_on_new_fixable_high(self):
        baseline = self.write("b.json", trivy_doc(trivy_vuln("CVE-1", "a")))
        candidate = self.write(
            "c.json", trivy_doc(trivy_vuln("CVE-1", "a"), trivy_vuln("CVE-9", "z", fixed="2"))
        )
        summary = self.dir / "summary.md"
        code = self.run_cli("trivy", baseline, candidate, "--only-fixable", "--summary", str(summary))
        self.assertEqual(code, 1)
        self.assertIn("CVE-9", summary.read_text(encoding="utf-8"))

    def test_cli_ignores_new_unfixable_when_only_fixable(self):
        baseline = self.write("b.json", trivy_doc())
        candidate = self.write("c.json", trivy_doc(trivy_vuln("CVE-9", "z")))
        self.assertEqual(self.run_cli("trivy", baseline, candidate, "--only-fixable"), 0)

    def test_cli_passes_when_findings_fall(self):
        baseline = self.write("b.json", trivy_doc(trivy_vuln("CVE-1", "a"), trivy_vuln("CVE-2", "b")))
        candidate = self.write("c.json", trivy_doc(trivy_vuln("CVE-1", "a")))
        self.assertEqual(self.run_cli("trivy", baseline, candidate), 0)

    def test_cli_without_baseline_does_not_block(self):
        candidate = self.write("c.json", {"matches": [grype_match("CVE-1", "a", severity="Critical", fixed="2")]})
        self.assertEqual(self.run_cli("grype", None, candidate), 0)
        self.assertEqual(self.run_cli("grype", self.dir / "missing.json", candidate), 0)

    def test_cli_unreadable_inputs_are_errors(self):
        self.assertEqual(self.run_cli("grype", None, self.dir / "nope.json"), 2)
        bad = self.dir / "bad.json"
        bad.write_text("not json", encoding="utf-8")
        self.assertEqual(self.run_cli("grype", None, bad), 2)


if __name__ == "__main__":
    unittest.main()
