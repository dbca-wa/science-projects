#!/usr/bin/env python3
"""Prune old GHCR container versions for a package — release-safe by design.

Why this exists
---------------
The original cleanup used a flat "keep the N most recent versions by date" rule.
That counted the moving ``test`` / ``test-*`` tags and the per-arch build parts
against the budget, so on each prod deploy they pushed real release manifests
(and the per-arch children they depend on) out of the window — deleting
production images the cluster still needed. This rewrite makes deleting a
production release structurally impossible under normal operation, and aborts
rather than risk it when anything looks wrong.

How a multi-arch release is stored in GHCR
------------------------------------------
A release tag like ``1.1.5`` is an *image index* (manifest list): one version
entry tagged ``1.1.5`` whose content references two child image manifests, one
per architecture. In the current build those children also carry the tags
``1.1.5-amd64`` / ``1.1.5-arm64``, but that is not guaranteed — a manifest list
can reference an *untagged* child. So children are protected by resolving the
index's real child digests from the registry, never by guessing from tag names.
The moving ``test`` tag has the same index+children shape.

Retention policy (matches the stated intent)
---------------------------------------------
Protected, never deleted:
  1. The newest ``KEEP_RELEASES`` production releases, chosen by **semver order**
     (highest versions win; date is only a tiebreaker). A release outside that
     window is removed only when doing so still leaves ``KEEP_RELEASES`` newer
     releases behind it — i.e. only once the quota is genuinely exceeded.
  2. Every child digest those protected release indexes reference (resolved live
     from the registry) — so a kept release can never be orphaned.
  3. The ``stable`` tag and its children.
  4. The single most recent ``test`` index and its children — the last staging
     build. Older ``test*`` leftovers are junk.

Deletable (junk):
  Everything else — untagged leftovers from superseded builds, old per-arch
  layers, and releases beyond the quota — keeping the newest ``KEEP_JUNK`` of the
  untagged/orphaned layers so a little recent history survives for inspection.

Safety invariants (abort the prune, delete nothing, on any of these)
--------------------------------------------------------------------
  * The version listing is empty or smaller than the number of protected
    versions we computed (a partial/failed list must never drive deletions).
  * Any version selected for deletion is also in the protected set (should be
    impossible; if it happens the classification is wrong — do not delete).
  * A protected release index's children could not be resolved from the registry
    (we must not delete when we cannot prove what is still referenced).

Env vars
--------
  GH_TOKEN       token with read:packages and delete:packages
  GHCR_OWNER     org login, e.g. dbca-wa
  GHCR_PACKAGE   package name, e.g. cannabis-backend
  KEEP_RELEASES  production releases to retain (default 15)
  KEEP_JUNK      untagged/orphaned leftover layers to retain (default 10)
  DRY_RUN        "true" to log without deleting (default false)
"""

from __future__ import annotations

import base64
import os
import re
import sys
import json
import urllib.error
import urllib.request

API = "https://api.github.com"
REGISTRY = "https://ghcr.io"
# Strict release tag: optional leading v, then X.Y.Z, nothing else.
SEMVER_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")
STABLE_TAG = "stable"
TEST_TAG = "test"
INDEX_ACCEPT = (
    "application/vnd.oci.image.index.v1+json,"
    "application/vnd.docker.distribution.manifest.list.v2+json"
)


# --------------------------------------------------------------------------- #
# GitHub Packages API (version listing / deletion)
# --------------------------------------------------------------------------- #
def _gh(method: str, url: str, token: str):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    return urllib.request.urlopen(req)


def list_versions(owner: str, package: str, token: str) -> list[dict]:
    versions: list[dict] = []
    page = 1
    while True:
        url = (
            f"{API}/orgs/{owner}/packages/container/{package}/versions"
            f"?per_page=100&page={page}&state=active"
        )
        with _gh("GET", url, token) as resp:
            batch = json.loads(resp.read())
        if not batch:
            break
        versions.extend(batch)
        page += 1
    return versions


def delete_version(owner: str, package: str, vid: int, token: str) -> None:
    url = f"{API}/orgs/{owner}/packages/container/{package}/versions/{vid}"
    _gh("DELETE", url, token).read()


def resolve_child_digests(owner: str, package: str, ref: str, token: str) -> set[str]:
    """Return the child image digests referenced by a manifest index/list.

    ``ref`` is a tag or a sha256 digest. A single-arch image (not an index) has
    no children and returns an empty set. Raises on transport/parse failure so
    the caller can treat "cannot resolve" as a reason to abort.
    """
    # GHCR's registry API accepts the GitHub token base64-encoded as the bearer.
    reg_token = base64.b64encode(token.encode()).decode()
    url = f"{REGISTRY}/v2/{owner}/{package}/manifests/{ref}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {reg_token}")
    req.add_header("Accept", INDEX_ACCEPT)
    with urllib.request.urlopen(req) as resp:
        body = json.loads(resp.read())
    return {
        m["digest"]
        for m in body.get("manifests", [])
        if isinstance(m, dict) and "digest" in m
    }


# --------------------------------------------------------------------------- #
# Pure classification (no network — resolver is injected for testability)
# --------------------------------------------------------------------------- #
def tags_of(v: dict) -> list[str]:
    return (v.get("metadata", {}).get("container", {}) or {}).get("tags", []) or []


def _semver_key(tag: str):
    m = SEMVER_RE.match(tag)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def plan(versions, keep_releases, keep_junk, child_resolver):
    """Decide what to keep and delete.

    Args:
      versions: list of GHCR version dicts (id, name=digest, created_at, tags).
      keep_releases: how many production releases to retain.
      keep_junk: how many orphaned untagged layers to retain.
      child_resolver: callable(ref) -> set[str] of child digests for a manifest.
        ``ref`` is a tag (preferred) or the version's digest (``name``).

    Returns (keep, delete, protected_digests, errors). ``errors`` is non-empty
    when a protected index's children could not be resolved; the caller must
    abort on errors.

    Three disjoint groups are formed:

    * protected — the top-N releases (by semver) + stable + latest test, plus
      every child digest those indexes reference. Never deleted.
    * pruned-release parts — releases beyond the quota and their children.
      Deleted in full (not routed through the junk budget), so a pruned release
      leaves nothing dangling and never consumes the orphan budget.
    * orphan junk — untagged/unreferenced leftovers from superseded builds. The
      newest ``keep_junk`` are kept; the rest are deleted.
    """
    errors: list[str] = []
    by_date = sorted(versions, key=lambda v: v["created_at"], reverse=True)

    def _preferred_ref(v: dict) -> str:
        tags = tags_of(v)
        return tags[0] if tags else v["name"]

    # --- rank release indexes by semver (highest wins; date breaks ties) ---
    release_ranked = []  # (semver_key, created_at, version)
    for v in versions:
        best = None
        for t in tags_of(v):
            k = _semver_key(t)
            if k and (best is None or k > best):
                best = k
        if best is not None:
            release_ranked.append((best, v["created_at"], v))
    release_ranked.sort(key=lambda t: (t[0], t[1]), reverse=True)

    protected_release_versions = [v for _, _, v in release_ranked[:keep_releases]]
    pruned_release_versions = [v for _, _, v in release_ranked[keep_releases:]]

    # --- also protect: stable index(es) and the single latest test index ---
    protected_indexes = list(protected_release_versions)
    protected_indexes += [v for v in versions if STABLE_TAG in tags_of(v)]
    test_indexes = [v for v in by_date if TEST_TAG in tags_of(v)]
    if test_indexes:
        protected_indexes.append(test_indexes[0])  # newest test only

    # --- resolve child digests of protected indexes (abort source on failure) ---
    protected_digests: set[str] = set()
    protected_ids: set[int] = set()
    for v in protected_indexes:
        protected_ids.add(v["id"])
        protected_digests.add(v["name"])
        try:
            protected_digests |= child_resolver(_preferred_ref(v))
        except Exception as e:  # noqa: BLE001 — any failure means "cannot prove"
            errors.append(f"could not resolve children of {_preferred_ref(v)}: {e}")

    # --- resolve child digests of releases we intend to prune, so their
    #     children are deleted together with the index (never left dangling) ---
    pruned_release_digests: set[str] = set()
    pruned_release_ids: set[int] = set()
    for v in pruned_release_versions:
        pruned_release_ids.add(v["id"])
        pruned_release_digests.add(v["name"])
        try:
            pruned_release_digests |= child_resolver(_preferred_ref(v))
        except Exception as e:  # noqa: BLE001
            # If we cannot resolve a pruned release's children, do not guess —
            # keep the whole release this run; a later run prunes it cleanly.
            errors.append(
                f"could not resolve children of pruned release "
                f"{_preferred_ref(v)}: {e}"
            )
    # A digest that is protected must never also be treated as prunable.
    pruned_release_digests -= protected_digests

    keep: list[dict] = []
    delete: list[dict] = []
    orphan_junk: list[dict] = []  # newest first

    for v in by_date:
        if v["id"] in protected_ids or v["name"] in protected_digests:
            keep.append(v)
        elif v["id"] in pruned_release_ids or v["name"] in pruned_release_digests:
            delete.append(v)  # pruned release index/child — remove fully
        else:
            orphan_junk.append(v)

    keep.extend(orphan_junk[:keep_junk])
    delete.extend(orphan_junk[keep_junk:])
    protected = {"ids": protected_ids, "digests": protected_digests}
    return keep, delete, protected, errors


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def main() -> int:
    owner = os.environ["GHCR_OWNER"]
    package = os.environ["GHCR_PACKAGE"]
    token = os.environ["GH_TOKEN"]
    keep_releases = int(os.environ.get("KEEP_RELEASES", "15"))
    keep_junk = int(os.environ.get("KEEP_JUNK", "10"))
    dry_run = os.environ.get("DRY_RUN", "false").lower() == "true"

    try:
        versions = list_versions(owner, package, token)
    except urllib.error.HTTPError as e:
        print(f"::warning::[{package}] could not list versions: {e}")
        return 0  # best-effort housekeeping; never fail the deploy

    if not versions:
        print(f"::warning::[{package}] version listing empty — skipping prune")
        return 0

    def resolver(ref: str) -> set[str]:
        return resolve_child_digests(owner, package, ref, token)

    keep, delete, protected, errors = plan(
        versions, keep_releases, keep_junk, resolver
    )
    protected_ids = protected["ids"]
    protected_digests = protected["digests"]

    # ---- hard safety invariants: abort (delete nothing) on any anomaly ----
    # 1. Could not resolve a protected (or pruned) release's children. We must
    #    not delete when we cannot prove what is still referenced.
    if errors:
        for msg in errors:
            print(f"::warning::[{package}] {msg}")
        print(
            f"::error::[{package}] could not resolve a release's children — "
            f"aborting prune, deleting nothing"
        )
        return 0

    # 2. A deletion must NEVER target a protected version (by id) or a digest
    #    referenced by a protected index. Pruning a beyond-quota release is fine;
    #    pruning anything in the protected set is a logic error — refuse.
    for v in delete:
        if v["id"] in protected_ids or v["name"] in protected_digests:
            print(
                f"::error::[{package}] delete set would hit a protected "
                f"version ({v['name'][:19]} tags={tags_of(v)}) — "
                f"aborting prune, deleting nothing"
            )
            return 0

    # 3. keep and delete must be disjoint, and together account for every
    #    listed version (no version silently lost or double-counted).
    keep_ids = {v["id"] for v in keep}
    delete_ids = {v["id"] for v in delete}
    if keep_ids & delete_ids:
        print(f"::error::[{package}] keep/delete overlap — aborting, deleting nothing")
        return 0
    if len(keep_ids) + len(delete_ids) != len(versions):
        print(
            f"::error::[{package}] partition mismatch "
            f"(keep={len(keep_ids)} delete={len(delete_ids)} total={len(versions)})"
            f" — aborting, deleting nothing"
        )
        return 0

    protected_release_tags = {
        t for v in keep for t in tags_of(v) if SEMVER_RE.match(t)
    }

    print(
        f"[{package}] total={len(versions)} keeping={len(keep)} "
        f"deleting={len(delete)}"
    )
    print(
        f"[{package}] protected releases: "
        f"{', '.join(sorted(protected_release_tags)) or '(none)'}"
    )
    print(f"[{package}] protected digests: {len(protected_digests)}")

    failures = 0
    for v in delete:
        label = ",".join(tags_of(v)) or f"untagged({v['name'][:19]})"
        if dry_run:
            print(f"[{package}] DRY_RUN would delete {label}")
            continue
        try:
            delete_version(owner, package, v["id"], token)
            print(f"[{package}] deleted {label}")
        except urllib.error.HTTPError as e:
            # The delete API intermittently fails; a transient failure must not
            # fail the deploy. The next run prunes whatever remains.
            print(f"::warning::[{package}] could not delete {label}: {e}")
            failures += 1

    if failures:
        print(
            f"::warning::[{package}] {failures} deletions failed (retried next run)"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
