#!/usr/bin/env python3
"""Tests for prune_ghcr.plan — the release-safety guarantees.

Runnable with `python3 .github/scripts/test_prune_ghcr.py` (no pytest needed).
Covers the exact incident (test tags pushing releases out), digest-based child
protection, semver ordering, the single-latest-test rule, quota behaviour, and
the abort-on-anomaly invariants.
"""
from __future__ import annotations

import importlib.util
import os

_spec = importlib.util.spec_from_file_location(
    "prune_ghcr", os.path.join(os.path.dirname(__file__), "prune_ghcr.py")
)
prune = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(prune)


# --------------------------------------------------------------------------- #
# Fixture builders
# --------------------------------------------------------------------------- #
_counter = [0]


def _vid() -> int:
    _counter[0] += 1
    return _counter[0]


def ver(digest: str, tags: list[str], ts: str) -> dict:
    return {
        "id": _vid(),
        "name": digest,
        "created_at": ts,
        "metadata": {"container": {"tags": tags}},
    }


def release(n_major, n_minor, n_patch, ts, also_stable=False):
    """A multi-arch release: index + two tagged children. Returns (versions, index_digest, child_digests)."""
    base = f"{n_major}.{n_minor}.{n_patch}"
    idx_d = f"sha256:idx-{base}"
    amd_d = f"sha256:amd-{base}"
    arm_d = f"sha256:arm-{base}"
    tags = [base] + (["stable"] if also_stable else [])
    versions = [
        ver(idx_d, tags, ts),
        ver(amd_d, [f"{base}-amd64"], ts),
        ver(arm_d, [f"{base}-arm64"], ts),
    ]
    return versions, idx_d, {amd_d, arm_d}


def make_test_build(ts, suffix):
    """A moving test build: index + two children (tagged)."""
    idx_d = f"sha256:idx-test-{suffix}"
    amd_d = f"sha256:amd-test-{suffix}"
    arm_d = f"sha256:arm-test-{suffix}"
    versions = [
        ver(idx_d, ["test"], ts),
        ver(amd_d, ["test-amd64"], ts),
        ver(arm_d, ["test-arm64"], ts),
    ]
    return versions, idx_d, {amd_d, arm_d}


def make_resolver(child_map: dict[str, set[str]]):
    """Resolver keyed by tag or digest -> child digests."""

    def resolver(ref: str) -> set[str]:
        return set(child_map.get(ref, set()))

    return resolver


def tags_in(versions):
    return {t for v in versions for t in prune.tags_of(v)}


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
def test_incident_scenario_releases_survive_many_test_builds():
    """The original bug: many recent test builds must not evict older releases."""
    versions = []
    child_map = {}
    # Ten releases, oldest first (older timestamps).
    for n in range(1, 11):
        vs, idx, kids = release(1, 1, n, f"2026-09-{n:02d}T00:00:00Z")
        versions += vs
        child_map[f"1.1.{n}"] = kids
        child_map[idx] = kids
    # Twenty NEWER test builds interleaved after them (newest timestamps),
    # each leaving its predecessor's children as untagged leftovers.
    for i in range(20):
        vs, idx, kids = make_test_build(f"2026-10-{i + 1:02d}T00:00:00Z", i)
        versions += vs
        child_map["test"] = kids  # only the latest matters; resolver by tag
        child_map[idx] = kids

    resolver = make_resolver(child_map)
    keep, delete, protected, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    kept_tags = tags_in(keep)
    deleted_tags = tags_in(delete)
    # Every release and its arch children survive.
    for n in range(1, 11):
        for t in (f"1.1.{n}", f"1.1.{n}-amd64", f"1.1.{n}-arm64"):
            assert t in kept_tags, f"release part {t} should be kept"
            assert t not in deleted_tags, f"release part {t} must not be deleted"
    # No release-looking tag is ever deleted.
    for t in deleted_tags:
        assert not prune.SEMVER_RE.match(t.replace("-amd64", "").replace("-arm64", "")) or t in kept_tags
    print("PASS incident_scenario")


def test_untagged_child_of_release_is_protected_by_digest():
    """A kept release whose child is UNTAGGED must still be protected."""
    idx_d = "sha256:idx-2.0.0"
    child_amd = "sha256:child-amd-untagged"
    child_arm = "sha256:child-arm-untagged"
    versions = [
        ver(idx_d, ["2.0.0"], "2026-10-01T00:00:00Z"),
        ver(child_amd, [], "2026-10-01T00:00:00Z"),  # untagged child!
        ver(child_arm, [], "2026-10-01T00:00:00Z"),  # untagged child!
        # plenty of junk so KEEP_JUNK doesn't accidentally save the children
        *[ver(f"sha256:junk{i}", [], f"2026-10-02T00:{i:02d}:00Z") for i in range(30)],
    ]
    resolver = make_resolver({"2.0.0": {child_amd, child_arm}, idx_d: {child_amd, child_arm}})
    keep, delete, protected, errors = prune.plan(
        versions, keep_releases=15, keep_junk=5, child_resolver=resolver
    )
    assert not errors, errors
    keep_digests = {v["name"] for v in keep}
    assert child_amd in keep_digests, "untagged amd child of kept release must be protected"
    assert child_arm in keep_digests, "untagged arm child of kept release must be protected"
    delete_digests = {v["name"] for v in delete}
    assert child_amd not in delete_digests and child_arm not in delete_digests
    print("PASS untagged_child_protected")


def test_semver_order_not_date_order():
    """A hotfix on an old date must count as a newer release than a lower version."""
    versions = []
    child_map = {}
    # 1.0.1 .. 1.0.20 all exist; give the LOW versions the NEWEST dates to try
    # to trick a date-based selector.
    for n in range(1, 21):
        ts = f"2026-10-{(21 - n):02d}T00:00:00Z"  # 1.0.1 newest date, 1.0.20 oldest
        vs, idx, kids = release(1, 0, n, ts)
        versions += vs
        child_map[f"1.0.{n}"] = kids
        child_map[idx] = kids
    resolver = make_resolver(child_map)
    keep, delete, protected, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    kept_tags = tags_in(keep)
    deleted_tags = tags_in(delete)
    # The 15 highest versions (1.0.6 .. 1.0.20) are kept; 1.0.1 .. 1.0.5 pruned.
    for n in range(6, 21):
        assert f"1.0.{n}" in kept_tags, f"1.0.{n} should be kept (top-15 by semver)"
    for n in range(1, 6):
        assert f"1.0.{n}" in deleted_tags, f"1.0.{n} should be pruned (lowest 5)"
    print("PASS semver_order")


def test_release_pruned_only_when_quota_exceeded():
    """Both conditions: delete oldest only if quota exceeded AND newer releases remain."""
    versions = []
    child_map = {}
    for n in range(1, 4):  # only 3 releases, keep_releases=15
        vs, idx, kids = release(1, 2, n, f"2026-09-{n:02d}T00:00:00Z")
        versions += vs
        child_map[f"1.2.{n}"] = kids
        child_map[idx] = kids
    resolver = make_resolver(child_map)
    keep, delete, _, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    assert not tags_in(delete), "with 3 releases and quota 15, nothing is pruned"
    print("PASS quota_not_exceeded")


def test_only_latest_test_kept():
    """The newest test index+children are kept; older test leftovers are junk."""
    versions = []
    child_map = {}
    old_vs, old_idx, old_kids = make_test_build("2026-10-01T00:00:00Z", "old")
    new_vs, new_idx, new_kids = make_test_build("2026-10-05T00:00:00Z", "new")
    # Simulate the moving tag: only the NEW index actually carries "test" now;
    # the old index's children became untagged leftovers.
    for v in old_vs:
        v["metadata"]["container"]["tags"] = []  # old test rolled off its tags
    versions += old_vs + new_vs
    child_map["test"] = new_kids
    child_map[new_idx] = new_kids
    resolver = make_resolver(child_map)
    keep, delete, _, errors = prune.plan(
        versions, keep_releases=15, keep_junk=0, child_resolver=resolver
    )
    assert not errors, errors
    keep_digests = {v["name"] for v in keep}
    assert new_idx in keep_digests and new_kids <= keep_digests, "latest test set kept"
    # With keep_junk=0 the old untagged leftovers are deletable.
    delete_digests = {v["name"] for v in delete}
    assert old_idx in delete_digests, "stale test leftover should be prunable"
    print("PASS only_latest_test")


def test_abort_when_children_unresolvable():
    """If a protected release's children can't be resolved, plan reports an error."""
    vs, idx, kids = release(3, 0, 0, "2026-10-01T00:00:00Z")

    def bad_resolver(ref):
        raise RuntimeError("registry down")

    keep, delete, _, errors = prune.plan(
        vs, keep_releases=15, keep_junk=10, child_resolver=bad_resolver
    )
    assert errors, "unresolvable children must surface an error (caller aborts)"
    print("PASS abort_on_unresolvable")


def test_stable_and_its_children_protected():
    versions = []
    child_map = {}
    vs, idx, kids = release(2, 5, 0, "2026-10-01T00:00:00Z", also_stable=True)
    versions += vs
    child_map["2.5.0"] = kids
    child_map["stable"] = kids
    child_map[idx] = kids
    versions += [ver(f"sha256:junk{i}", [], f"2026-10-02T00:{i:02d}:00Z") for i in range(20)]
    resolver = make_resolver(child_map)
    keep, delete, _, errors = prune.plan(
        versions, keep_releases=15, keep_junk=5, child_resolver=resolver
    )
    assert not errors, errors
    kept = tags_in(keep)
    assert "stable" in kept and "2.5.0" in kept
    print("PASS stable_protected")


def test_pruned_release_deleted_fully_no_dangling_children():
    """A beyond-quota release and ALL its children are deleted together."""
    versions = []
    child_map = {}
    # 16 releases, quota 15 -> the lowest (1.0.1) must be pruned in full.
    for n in range(1, 17):
        vs, idx, kids = release(1, 0, n, f"2026-09-{n:02d}T00:00:00Z")
        versions += vs
        child_map[f"1.0.{n}"] = kids
        child_map[idx] = kids
    resolver = make_resolver(child_map)
    keep, delete, protected, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    del_tags = tags_in(delete)
    keep_tags = tags_in(keep)
    # 1.0.1 index AND both arch children are in delete, none in keep.
    for t in ("1.0.1", "1.0.1-amd64", "1.0.1-arm64"):
        assert t in del_tags, f"{t} should be fully pruned"
        assert t not in keep_tags, f"{t} must not survive"
    # 1.0.2..1.0.16 fully kept.
    for n in range(2, 17):
        for t in (f"1.0.{n}", f"1.0.{n}-amd64", f"1.0.{n}-arm64"):
            assert t in keep_tags and t not in del_tags, f"{t} should be kept"
    print("PASS pruned_release_deleted_fully")


def test_fewer_releases_than_quota_prunes_no_release():
    """A short/partial listing (fewer releases than the quota) prunes no release."""
    versions = []
    child_map = {}
    for n in range(1, 4):  # only 3 releases visible
        vs, idx, kids = release(1, 0, n, f"2026-09-{n:02d}T00:00:00Z")
        versions += vs
        child_map[f"1.0.{n}"] = kids
        child_map[idx] = kids
    resolver = make_resolver(child_map)
    keep, delete, _, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    assert not tags_in(delete), "no release pruned when fewer releases than quota"
    print("PASS fewer_releases_than_quota")


def test_partition_is_total_and_disjoint():
    """Every version is in exactly one of keep/delete."""
    versions = []
    child_map = {}
    for n in range(1, 5):
        vs, idx, kids = release(2, 0, n, f"2026-09-{n:02d}T00:00:00Z")
        versions += vs
        child_map[f"2.0.{n}"] = kids
        child_map[idx] = kids
    versions += [ver(f"sha256:j{i}", [], f"2026-10-{i + 1:02d}T00:00:00Z") for i in range(25)]
    resolver = make_resolver(child_map)
    keep, delete, _, errors = prune.plan(
        versions, keep_releases=15, keep_junk=10, child_resolver=resolver
    )
    assert not errors, errors
    keep_ids = {v["id"] for v in keep}
    delete_ids = {v["id"] for v in delete}
    assert not (keep_ids & delete_ids), "keep/delete must be disjoint"
    assert len(keep_ids) + len(delete_ids) == len(versions), "partition must be total"
    print("PASS partition_total_disjoint")


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\nAll {len(tests)} prune_ghcr tests passed.")


if __name__ == "__main__":
    main()
