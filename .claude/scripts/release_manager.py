#!/usr/bin/env python3
"""Release manager CLI for claude-task-development-framework.

Provides deterministic release operations for the /release skill:
- Version detection from manifest files
- Conventional commit parsing and classification
- Semantic version bump calculation
- Changelog generation in Keep a Changelog format

All output is JSON (default) or plain text.
Zero external dependencies — stdlib only.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────────────────

TASK_CODE_RE = re.compile(r"\(([A-Z][A-Z0-9]{1,5}-\d{3})\)\s*$")

CONVENTIONAL_RE = re.compile(
    r"^(?P<prefix>feat|fix|chore|docs|refactor|perf|test|ci|style|build|revert)"
    r"(?P<breaking>!)?"
    r":\s*(?P<description>.+)$"
)

# Mapping: conventional prefix → Keep a Changelog category (None = excluded)
PREFIX_TO_CATEGORY = {
    "feat": "Added",
    "fix": "Fixed",
    "refactor": "Changed",
    "perf": "Changed",
    "revert": "Removed",
    "docs": None,
    "chore": None,
    "ci": None,
    "test": None,
    "style": None,
    "build": None,
}

# For commits without conventional prefix, classify by first word
KEYWORD_TO_CATEGORY = {
    "add": "Added", "implement": "Added", "create": "Added", "introduce": "Added",
    "fix": "Fixed", "resolve": "Fixed", "correct": "Fixed", "patch": "Fixed",
    "remove": "Removed", "delete": "Removed", "drop": "Removed",
    "update": "Changed", "refactor": "Changed", "improve": "Changed",
    "optimize": "Changed", "change": "Changed",
}

CHANGELOG_ORDER = ["Added", "Changed", "Fixed", "Removed", "Security"]

SECURITY_KEYWORDS = {"security", "cve", "vulnerability", "auth hardening", "xss", "injection"}

VERSION_RE = re.compile(r"(\d+)\.(\d+)\.(\d+)(?:-beta)?")

# ── Project Root Detection ──────────────────────────────────────────────────

def find_project_root() -> Path:
    """Find project root via git."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, check=True,
        )
        return Path(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        return Path.cwd()


# ── Version Detection ───────────────────────────────────────────────────────

def read_version_from_package_json(filepath: Path) -> str | None:
    """Read version from package.json."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("version")
    except (json.JSONDecodeError, FileNotFoundError, OSError):
        return None


def read_version_from_pyproject(filepath: Path) -> str | None:
    """Read version from pyproject.toml."""
    try:
        # Python 3.11+ has tomllib
        import tomllib
        with open(filepath, "rb") as f:
            data = tomllib.load(f)
        return data.get("project", {}).get("version")
    except ImportError:
        pass
    # Fallback to regex
    try:
        content = filepath.read_text(encoding="utf-8")
        m = re.search(r'version\s*=\s*"([^"]+)"', content)
        return m.group(1) if m else None
    except (FileNotFoundError, OSError):
        return None


def read_version_from_cargo(filepath: Path) -> str | None:
    """Read version from Cargo.toml."""
    try:
        content = filepath.read_text(encoding="utf-8")
        # Match the first version in [package] section
        in_package = False
        for line in content.splitlines():
            if line.strip() == "[package]":
                in_package = True
                continue
            if in_package and line.strip().startswith("["):
                break
            if in_package:
                m = re.match(r'version\s*=\s*"([^"]+)"', line.strip())
                if m:
                    return m.group(1)
    except (FileNotFoundError, OSError):
        pass
    return None


def read_version_from_setup_py(filepath: Path) -> str | None:
    """Read version from setup.py."""
    try:
        content = filepath.read_text(encoding="utf-8")
        m = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
        return m.group(1) if m else None
    except (FileNotFoundError, OSError):
        return None


MANIFEST_READERS = [
    ("package.json", read_version_from_package_json),
    ("pyproject.toml", read_version_from_pyproject),
    ("Cargo.toml", read_version_from_cargo),
    ("setup.py", read_version_from_setup_py),
]


def get_latest_tag(tag_prefix: str) -> str | None:
    """Get the latest git tag matching the prefix."""
    try:
        result = subprocess.run(
            ["git", "tag", "-l", f"{tag_prefix}*", "--sort=-v:refname"],
            capture_output=True, text=True, check=True,
        )
        tags = result.stdout.strip().splitlines()
        return tags[0] if tags else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


# ── Commit Parsing ──────────────────────────────────────────────────────────

def classify_non_conventional(message: str) -> str | None:
    """Classify a non-conventional commit by keyword analysis."""
    lower = message.lower().strip()
    # Check for security-related content
    if any(kw in lower for kw in SECURITY_KEYWORDS):
        return "Security"
    # Check first word
    first_word = lower.split()[0] if lower else ""
    return KEYWORD_TO_CATEGORY.get(first_word, "Changed")


def parse_single_commit(line: str) -> dict:
    """Parse a single oneline commit into structured data."""
    # Format: "hash message"
    parts = line.split(" ", 1)
    if len(parts) < 2:
        return {"hash": parts[0] if parts else "", "message": "", "skip": True}

    commit_hash = parts[0]
    message = parts[1].strip()

    # Extract task code from end of message
    task_code = None
    task_match = TASK_CODE_RE.search(message)
    if task_match:
        task_code = task_match.group(1)

    # Parse conventional commit
    conv_match = CONVENTIONAL_RE.match(message)

    if conv_match:
        prefix = conv_match.group("prefix")
        is_breaking = conv_match.group("breaking") == "!"
        description = conv_match.group("description").strip()
        category = PREFIX_TO_CATEGORY.get(prefix)

        # Security override
        if category and any(kw in description.lower() for kw in SECURITY_KEYWORDS):
            category = "Security"

        return {
            "hash": commit_hash,
            "message": message,
            "prefix": prefix,
            "is_breaking": is_breaking,
            "description": description,
            "task_code": task_code,
            "changelog_category": category,
            "skip": False,
        }
    else:
        category = classify_non_conventional(message)
        return {
            "hash": commit_hash,
            "message": message,
            "prefix": None,
            "is_breaking": False,
            "description": message,
            "task_code": task_code,
            "changelog_category": category,
            "skip": False,
        }


def check_breaking_in_bodies(since_tag: str | None) -> int:
    """Check for BREAKING CHANGE: in commit bodies."""
    try:
        cmd = ["git", "log", "--no-merges", "--format=%B"]
        if since_tag:
            cmd.insert(2, f"{since_tag}..HEAD")
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.count("BREAKING CHANGE")
    except (subprocess.CalledProcessError, FileNotFoundError):
        return 0


# ── Subcommand: current-version ────────────────────────────────────────────

def cmd_current_version(args):
    """Detect version from manifest files and git tags."""
    root = find_project_root()
    tag_prefix = args.tag_prefix

    all_sources = []
    primary_version = None
    primary_file = None

    for filename, reader in MANIFEST_READERS:
        filepath = root / filename
        if filepath.exists():
            version = reader(filepath)
            if version:
                all_sources.append({"file": filename, "version": version})
                if primary_version is None:
                    primary_version = version
                    primary_file = filename

    latest_tag = get_latest_tag(tag_prefix)

    if primary_version is None:
        primary_version = "0.0.0"
        primary_file = None

    is_beta = primary_version.endswith("-beta")
    base_version = primary_version.removesuffix("-beta")

    result = {
        "version": primary_version,
        "base_version": base_version,
        "is_beta": is_beta,
        "source_file": primary_file,
        "all_sources": all_sources,
        "latest_tag": latest_tag,
        "tag_prefix": tag_prefix,
    }
    print(json.dumps(result, indent=2))


# ── Subcommand: parse-commits ──────────────────────────────────────────────

def cmd_parse_commits(args):
    """Parse git log into structured commit data."""
    since_tag = args.since if args.since else None

    # Get oneline log
    cmd = ["git", "log", "--oneline", "--no-merges"]
    if since_tag:
        cmd.insert(2, f"{since_tag}..HEAD")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(json.dumps({"error": str(e), "commits": [], "summary": {}}))
        sys.exit(1)

    lines = [l for l in result.stdout.strip().splitlines() if l.strip()]
    commits = [parse_single_commit(line) for line in lines]

    # Check for BREAKING CHANGE in bodies
    body_breaking_count = check_breaking_in_bodies(since_tag)

    # Build summary
    features = sum(1 for c in commits if c.get("prefix") == "feat")
    fixes = sum(1 for c in commits if c.get("prefix") == "fix")
    breaking = sum(1 for c in commits if c.get("is_breaking")) + body_breaking_count
    excluded = sum(1 for c in commits if c.get("changelog_category") is None)
    has_meaningful = any(c.get("changelog_category") is not None for c in commits)

    # Determine suggested bump
    if breaking > 0:
        suggested_bump = "major"
    elif features > 0:
        suggested_bump = "minor"
    else:
        suggested_bump = "patch"

    output = {
        "commits": commits,
        "summary": {
            "total": len(commits),
            "breaking": breaking,
            "features": features,
            "fixes": fixes,
            "other": len(commits) - features - fixes - excluded,
            "excluded": excluded,
            "has_meaningful_changes": has_meaningful,
        },
        "has_breaking_changes": breaking > 0,
        "suggested_bump": suggested_bump,
    }
    print(json.dumps(output, indent=2))


# ── Subcommand: suggest-bump ───────────────────────────────────────────────

def cmd_suggest_bump(args):
    """Calculate the new version based on bump type."""
    current = args.current_version
    is_beta = current.endswith("-beta")
    base = current.removesuffix("-beta")

    m = VERSION_RE.match(base)
    if not m:
        print(json.dumps({"error": f"Cannot parse version: {base}"}))
        sys.exit(1)

    major, minor, patch = int(m.group(1)), int(m.group(2)), int(m.group(3))

    bump = args.force if args.force else args.suggested_bump

    if bump == "major":
        new_version = f"{major + 1}.0.0-beta"
    elif bump == "minor":
        new_version = f"{major}.{minor + 1}.0"
    elif bump == "patch":
        new_version = f"{major}.{minor}.{patch + 1}"
    else:
        new_version = f"{major}.{minor}.{patch + 1}"

    result = {
        "current_version": current,
        "base_version": base,
        "is_current_beta": is_beta,
        "bump_type": bump,
        "new_version": new_version,
        "is_new_beta": new_version.endswith("-beta"),
        "is_forced": args.force is not None,
    }
    print(json.dumps(result, indent=2))


# ── Subcommand: generate-changelog ─────────────────────────────────────────

def cmd_generate_changelog(args):
    """Generate a changelog section from commits JSON (stdin)."""
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Error reading commits JSON from stdin: {e}", file=sys.stderr)
        sys.exit(1)

    commits = data.get("commits", [])
    version = args.version
    release_date = args.date if args.date else date.today().isoformat()

    # Group by category
    groups: dict[str, list[str]] = {}
    for commit in commits:
        category = commit.get("changelog_category")
        if not category:
            continue
        description = commit.get("description", commit.get("message", ""))
        task_code = commit.get("task_code")
        entry = f"- {description}"
        if task_code:
            entry += f" ({task_code})"
        groups.setdefault(category, []).append(entry)

    # Build output
    lines = [f"## [{version}] - {release_date}", ""]

    for category in CHANGELOG_ORDER:
        entries = groups.get(category, [])
        if entries:
            lines.append(f"### {category}")
            lines.extend(entries)
            lines.append("")

    print("\n".join(lines).rstrip())


# ── Release Plan Helpers ──────────────────────────────────────────────────

RELEASES_FILENAME = "releases.json"


def _releases_path() -> Path:
    """Return path to releases.json at project root."""
    return find_project_root() / RELEASES_FILENAME


def _read_releases() -> dict:
    """Read releases.json. Returns empty structure if missing."""
    fp = _releases_path()
    if not fp.exists():
        return {"releases": []}
    try:
        with open(fp, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"releases": []}


def _write_releases(data: dict) -> None:
    """Write releases.json atomically."""
    fp = _releases_path()
    with open(fp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def _parse_semver(v: str) -> tuple[int, int, int, bool]:
    """Parse a semver string into (major, minor, patch, is_beta)."""
    is_beta = v.endswith("-beta")
    clean = v.removesuffix("-beta").lstrip("vV")
    m = VERSION_RE.match(clean)
    if not m:
        return (0, 0, 0, is_beta)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), is_beta)


def _semver_sort_key(release: dict) -> tuple:
    """Sort key for releases by semantic version."""
    major, minor, patch, is_beta = _parse_semver(release.get("version", "0.0.0"))
    return (major, minor, patch, 0 if is_beta else 1)


# ── Subcommand: release-plan-list ─────────────────────────────────────────

def cmd_release_plan_list(args):
    """List all planned releases with stats."""
    data = _read_releases()
    releases = sorted(data.get("releases", []), key=_semver_sort_key)

    # Determine next release (lowest non-released)
    next_release = None
    for rel in releases:
        if rel.get("status") != "released":
            next_release = rel.get("version")
            break

    output = {
        "releases": releases,
        "next_release": next_release,
        "total": len(releases),
    }
    print(json.dumps(output, indent=2))


# ── Subcommand: release-plan-create ───────────────────────────────────────

def cmd_release_plan_create(args):
    """Create a new release plan entry."""
    version = args.version.lstrip("vV")
    theme = args.theme or ""
    target_date = args.target_date or None

    data = _read_releases()
    releases = data.get("releases", [])

    # Check for duplicate version
    for rel in releases:
        if rel.get("version") == version:
            print(json.dumps({"error": f"Release {version} already exists"}))
            sys.exit(1)

    new_release = {
        "version": version,
        "status": "planned",
        "target_date": target_date,
        "theme": theme,
        "tasks": [],
        "created_at": date.today().isoformat(),
        "released_at": None,
    }
    releases.append(new_release)
    data["releases"] = releases
    _write_releases(data)

    print(json.dumps({"success": True, "release": new_release}, indent=2))


# ── Subcommand: release-plan-add-task ─────────────────────────────────────

def cmd_release_plan_add_task(args):
    """Add a task to a release."""
    version = args.version.lstrip("vV")
    task_code = args.task.upper()

    data = _read_releases()
    releases = data.get("releases", [])

    target = None
    for rel in releases:
        if rel.get("version") == version:
            target = rel
            break

    if not target:
        print(json.dumps({"error": f"Release {version} not found"}))
        sys.exit(1)

    tasks = target.get("tasks", [])
    if task_code in tasks:
        print(json.dumps({"error": f"Task {task_code} already in release {version}"}))
        sys.exit(1)

    tasks.append(task_code)
    target["tasks"] = tasks
    _write_releases(data)

    print(json.dumps({"success": True, "version": version, "task": task_code}, indent=2))


# ── Subcommand: release-plan-remove-task ──────────────────────────────────

def cmd_release_plan_remove_task(args):
    """Remove a task from a release."""
    version = args.version.lstrip("vV")
    task_code = args.task.upper()

    data = _read_releases()
    releases = data.get("releases", [])

    target = None
    for rel in releases:
        if rel.get("version") == version:
            target = rel
            break

    if not target:
        print(json.dumps({"error": f"Release {version} not found"}))
        sys.exit(1)

    tasks = target.get("tasks", [])
    if task_code not in tasks:
        print(json.dumps({"error": f"Task {task_code} not found in release {version}"}))
        sys.exit(1)

    tasks.remove(task_code)
    target["tasks"] = tasks
    _write_releases(data)

    print(json.dumps({"success": True, "version": version, "task": task_code}, indent=2))


# ── Subcommand: release-plan-next ─────────────────────────────────────────

def cmd_release_plan_next(args):
    """Return the next planned (non-released) release."""
    data = _read_releases()
    releases = sorted(data.get("releases", []), key=_semver_sort_key)

    next_release = None
    for rel in releases:
        if rel.get("status") != "released":
            next_release = rel
            break

    if next_release:
        print(json.dumps({"found": True, "release": next_release}, indent=2))
    else:
        print(json.dumps({"found": False, "release": None}, indent=2))


# ── Subcommand: release-plan-mark-released ────────────────────────────────

def cmd_release_plan_mark_released(args):
    """Mark a release as released."""
    version = args.version.lstrip("vV")

    data = _read_releases()
    releases = data.get("releases", [])

    target = None
    for rel in releases:
        if rel.get("version") == version:
            target = rel
            break

    if not target:
        print(json.dumps({"error": f"Release {version} not found"}))
        sys.exit(1)

    target["status"] = "released"
    target["released_at"] = date.today().isoformat()
    _write_releases(data)

    print(json.dumps({"success": True, "version": version, "released_at": target["released_at"]}, indent=2))


# ── CLI Setup ───────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Release manager CLI for claude-task-development-framework",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # current-version
    p = sub.add_parser("current-version", help="Detect version from manifest files")
    p.add_argument("--tag-prefix", default="v", help="Git tag prefix (default: v)")
    p.set_defaults(func=cmd_current_version)

    # parse-commits
    p = sub.add_parser("parse-commits", help="Parse git log into structured data")
    p.add_argument("--since", default=None, help="Git tag to use as base (commits since this tag)")
    p.set_defaults(func=cmd_parse_commits)

    # suggest-bump
    p = sub.add_parser("suggest-bump", help="Calculate new version from bump type")
    p.add_argument("--current-version", required=True, help="Current version string")
    p.add_argument("--suggested-bump", choices=["major", "minor", "patch"], default="patch",
                    help="Suggested bump from parse-commits")
    p.add_argument("--force", choices=["major", "minor", "patch"], default=None,
                    help="Force a specific bump type (overrides suggested)")
    p.set_defaults(func=cmd_suggest_bump)

    # generate-changelog
    p = sub.add_parser("generate-changelog", help="Generate changelog section from commits JSON (stdin)")
    p.add_argument("--version", required=True, help="Version string for the header")
    p.add_argument("--date", default=None, help="Release date (YYYY-MM-DD, default: today)")
    p.set_defaults(func=cmd_generate_changelog)

    # release-plan-list
    p = sub.add_parser("release-plan-list", help="List all planned releases")
    p.set_defaults(func=cmd_release_plan_list)

    # release-plan-create
    p = sub.add_parser("release-plan-create", help="Create a new release plan entry")
    p.add_argument("--version", required=True, help="Release version (e.g., 1.4.0)")
    p.add_argument("--theme", default=None, help="Release theme description")
    p.add_argument("--target-date", default=None, help="Target date (YYYY-MM-DD)")
    p.set_defaults(func=cmd_release_plan_create)

    # release-plan-add-task
    p = sub.add_parser("release-plan-add-task", help="Add a task to a release")
    p.add_argument("--version", required=True, help="Release version")
    p.add_argument("--task", required=True, help="Task code (e.g., AUTH-001)")
    p.set_defaults(func=cmd_release_plan_add_task)

    # release-plan-remove-task
    p = sub.add_parser("release-plan-remove-task", help="Remove a task from a release")
    p.add_argument("--version", required=True, help="Release version")
    p.add_argument("--task", required=True, help="Task code (e.g., AUTH-001)")
    p.set_defaults(func=cmd_release_plan_remove_task)

    # release-plan-next
    p = sub.add_parser("release-plan-next", help="Return the next planned release")
    p.set_defaults(func=cmd_release_plan_next)

    # release-plan-mark-released
    p = sub.add_parser("release-plan-mark-released", help="Mark a release as released")
    p.add_argument("--version", required=True, help="Release version to mark")
    p.set_defaults(func=cmd_release_plan_mark_released)

    return parser


def main():
    parser = build_parser()
    try:
        args = parser.parse_args()
        args.func(args)
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
