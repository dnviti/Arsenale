---
name: release-plan
description: Plan release versions, assign tasks to releases by shared concepts/goals, and view the release timeline.
disable-model-invocation: true
argument-hint: "[list|create|assign|unassign|suggest|timeline] [args]"
---

# Release Planning

You are a release planner for the Arsenale project. Your job is to manage release plans — grouping tasks into versioned releases by shared concepts and goals, and maintaining a release timeline.

Always respond and work in English.

## Mode Detection

!`python3 .claude/scripts/task_manager.py platform-config`

Use the `mode` field to determine behavior: `platform-only`, `dual-sync`, or `local-only`. The JSON includes `platform`, `enabled`, `sync`, `repo`, `cli` (gh/glab), and `labels`.

## Platform Commands

Use `python3 .claude/scripts/task_manager.py platform-cmd <operation> [key=value ...]` to generate the correct CLI command for the detected platform (GitHub/GitLab).

Supported operations: `list-issues`, `search-issues`, `view-issue`, `edit-issue`, `close-issue`, `comment-issue`, `create-issue`, `create-pr`, `list-pr`, `merge-pr`, `create-release`, `edit-release`.

## Release Plan Data

### Current version:
!`python3 .claude/scripts/release_manager.py current-version --tag-prefix "v"`

### Current release plan:
!`python3 .claude/scripts/release_manager.py release-plan-list`

### Release label prefix:
!`jq -r '.labels.release_prefix // "release:"' .claude/issues-tracker.json 2>/dev/null || echo "release:"`

## Arguments

The user invoked with: **$ARGUMENTS**

## Instructions

Parse `$ARGUMENTS` to determine the subcommand. If empty or `list`, default to the **list** subcommand.

---

### Subcommand A: `list` (default)

Show a release timeline overview.

1. Read the release plan data from the "Current release plan" section above.
2. If no releases exist, inform the user: "No release plans found. Use `/release-plan create vX.Y.Z` to create one, or `/release-plan suggest` to auto-generate release groupings."
3. If releases exist, present a formatted table:

```
=== Release Timeline ===

| Version | Status      | Theme                              | Target Date | Tasks | Done | Progress |
|---------|-------------|---------------------------------------|-------------|-------|------|----------|
| v1.4.0  | planned     | Security & Context Menu Improvements | 2026-04-01  | 3     | 1    | 33%      |
| v1.5.0  | planned     | Multi-tenant foundations              | —           | 5     | 0    | 0%       |

Next release: v1.4.0
```

4. To compute "Done" counts:
   - **Platform-only mode:** For each task code in the release, check if the corresponding issue has `status:done` label:
     ```bash
     gh issue list --repo "$TRACKER_REPO" --search "[TASK-CODE] in:title" --label "task,status:done" --state closed --json number --jq 'length'
     ```
   - **Local/dual mode:** Check if the task code exists in `done.txt` by running:
     ```bash
     python3 .claude/scripts/task_manager.py parse TASK-CODE
     ```
     and checking the file field.

---

### Subcommand B: `create vX.Y.Z`

Create a new release plan entry.

1. Parse the version from `$ARGUMENTS` (e.g., `create v1.4.0` or `create 1.4.0`).
2. If no version was provided, use `AskUserQuestion` to ask for one:
   > "What version should this release be?"
   Suggest the next version based on the current version from the "Current version" section above.

3. Use `AskUserQuestion` to ask for the release theme:
   > "What is the theme/goal for this release? (e.g., 'Security hardening', 'Multi-tenant foundations')"
   Options:
   - **"Enter a theme"** — let user type the theme
   - **"No theme"** — leave it empty

   STOP HERE after calling `AskUserQuestion`. Do NOT proceed until the user responds.

4. Optionally ask for a target date:
   > "Do you want to set a target date for this release?"
   Options:
   - **"Yes, set a date"** — let user specify a YYYY-MM-DD date
   - **"No target date"** — leave it null

   STOP HERE after calling `AskUserQuestion`. Do NOT proceed until the user responds.

5. Create the release entry:
   ```bash
   python3 .claude/scripts/release_manager.py release-plan-create --version "$VERSION" --theme "$THEME" --target-date "$DATE"
   ```

6. **In platform-only or dual sync mode**, also create the platform artifacts:
   - **Create the release label** (if it doesn't exist):
     ```bash
     RELEASE_PREFIX=$(jq -r '.labels.release_prefix // "release:"' "$TRACKER_CFG")
     gh label create "${RELEASE_PREFIX}v${VERSION}" --repo "$TRACKER_REPO" --color "006b75" --description "Target release v${VERSION}" 2>/dev/null || true
     # GitLab: glab label create "${RELEASE_PREFIX}v${VERSION}" -R "$TRACKER_REPO" --color "#006b75" --description "Target release v${VERSION}" 2>/dev/null || true
     ```
   - **Create a milestone** (optional but useful for GitHub/GitLab grouping):
     ```bash
     # GitHub:
     gh api repos/$TRACKER_REPO/milestones --method POST -f title="v${VERSION}" -f description="$THEME" -f due_on="${TARGET_DATE}T00:00:00Z" 2>/dev/null || true
     # GitLab: glab api projects/:id/milestones --method POST -f title="v${VERSION}" -f description="$THEME" -f due_date="$TARGET_DATE" 2>/dev/null || true
     ```
     If no target date, omit the `due_on`/`due_date` field.

7. Report:
   > "Release **v{VERSION}** created.
   > - Theme: {THEME}
   > - Target date: {DATE or 'not set'}
   > - Tasks: 0 (use `/release-plan assign TASK-CODE v{VERSION}` to add tasks)"

---

### Subcommand C: `assign TASK-CODE vX.Y.Z`

Assign a task to a release.

1. Parse task code and version from `$ARGUMENTS` (e.g., `assign CTX-301 v1.4.0`).

2. Verify the task exists:
   - **Platform-only mode:** `gh issue list --repo "$TRACKER_REPO" --search "[TASK-CODE] in:title" --label task --state all --json number,title --jq '.[0]'`
   - **Local/dual mode:** `python3 .claude/scripts/task_manager.py parse TASK-CODE`

3. Verify the release exists:
   ```bash
   python3 .claude/scripts/release_manager.py release-plan-list
   ```
   If the release does not exist, use `AskUserQuestion`:
   > "Release v{VERSION} does not exist. Create it?"
   Options:
   - **"Yes, create it"** — run the `create` subcommand flow
   - **"Cancel"** — abort

   STOP HERE after calling `AskUserQuestion`. Do NOT proceed until the user responds.

4. Check if the task is already assigned to a different release. If so, warn:
   > "Task {TASK-CODE} is currently assigned to release v{OLD_VERSION}. Reassign to v{NEW_VERSION}?"
   Options:
   - **"Yes, reassign"** — remove from old release, add to new
   - **"Cancel"** — abort

   STOP HERE after calling `AskUserQuestion`. Do NOT proceed until the user responds.

5. Add the task to the release:
   ```bash
   python3 .claude/scripts/release_manager.py release-plan-add-task --version "$VERSION" --task "$TASK_CODE"
   ```

6. Update the task's Release field:
   - **Local/dual mode:**
     ```bash
     python3 .claude/scripts/task_manager.py set-release $TASK_CODE --version $VERSION
     ```
   - **Platform-only or dual sync mode** — add the release label and milestone:
     ```bash
     RELEASE_PREFIX=$(jq -r '.labels.release_prefix // "release:"' "$TRACKER_CFG")
     ISSUE_NUM=$(gh issue list --repo "$TRACKER_REPO" --search "[TASK-CODE] in:title" --label task --json number --jq '.[0].number')
     # GitLab: glab issue list -R "$TRACKER_REPO" --search "[TASK-CODE]" -l task --output json | jq '.[0].iid'
     gh issue edit "$ISSUE_NUM" --repo "$TRACKER_REPO" --add-label "${RELEASE_PREFIX}v${VERSION}"
     # GitLab: glab issue update "$ISSUE_NUM" -R "$TRACKER_REPO" --label "${RELEASE_PREFIX}v${VERSION}"
     # Add milestone:
     MILESTONE_NUM=$(gh api repos/$TRACKER_REPO/milestones --jq ".[] | select(.title==\"v${VERSION}\") | .number" 2>/dev/null)
     [ -n "$MILESTONE_NUM" ] && gh issue edit "$ISSUE_NUM" --repo "$TRACKER_REPO" --milestone "v${VERSION}" 2>/dev/null || true
     # GitLab: glab issue update "$ISSUE_NUM" -R "$TRACKER_REPO" --milestone "v${VERSION}" 2>/dev/null || true
     ```

7. Report:
   > "Task **{TASK-CODE}** assigned to release **v{VERSION}**."

---

### Subcommand D: `unassign TASK-CODE`

Remove a task from its release.

1. Parse the task code from `$ARGUMENTS`.

2. Find which release the task belongs to:
   ```bash
   python3 .claude/scripts/release_manager.py release-plan-list
   ```
   Search through all releases' `tasks` arrays for the task code.

3. If the task is not in any release, inform the user and stop.

4. Remove the task from the release:
   ```bash
   python3 .claude/scripts/release_manager.py release-plan-remove-task --version "$VERSION" --task "$TASK_CODE"
   ```

5. Clear the task's Release field:
   - **Local/dual mode:**
     ```bash
     python3 .claude/scripts/task_manager.py set-release $TASK_CODE --version None
     ```
   - **Platform-only or dual sync mode** — remove the release label:
     ```bash
     RELEASE_PREFIX=$(jq -r '.labels.release_prefix // "release:"' "$TRACKER_CFG")
     ISSUE_NUM=$(gh issue list --repo "$TRACKER_REPO" --search "[TASK-CODE] in:title" --label task --json number --jq '.[0].number')
     # GitLab: glab issue list -R "$TRACKER_REPO" --search "[TASK-CODE]" -l task --output json | jq '.[0].iid'
     gh issue edit "$ISSUE_NUM" --repo "$TRACKER_REPO" --remove-label "${RELEASE_PREFIX}v${VERSION}"
     # GitLab: glab issue update "$ISSUE_NUM" -R "$TRACKER_REPO" --unlabel "${RELEASE_PREFIX}v${VERSION}"
     # Clear milestone:
     gh issue edit "$ISSUE_NUM" --repo "$TRACKER_REPO" --milestone "" 2>/dev/null || true
     # GitLab: glab issue update "$ISSUE_NUM" -R "$TRACKER_REPO" --milestone "" 2>/dev/null || true
     ```

6. Report:
   > "Task **{TASK-CODE}** removed from release **v{VERSION}**."

---

### Subcommand E: `suggest`

The core conceptual grouping feature. Analyzes all unassigned tasks and suggests release groupings.

**Step E1: Gather unassigned tasks**

Collect all open tasks that are NOT in any release:

- Read the release plan to get all currently assigned task codes.
- **Platform-only mode:** Query all open task issues:
  ```bash
  gh issue list --repo "$TRACKER_REPO" --label "task" --state open --json number,title,labels,body --jq '.[]'
  ```
  Filter out tasks whose title contains a code already in a release's `tasks` array.

- **Local/dual mode:**
  ```bash
  python3 .claude/scripts/task_manager.py list --status todo --format json
  python3 .claude/scripts/task_manager.py list --status progressing --format json
  ```
  Filter out tasks that have a non-empty `release` field.

If no unassigned tasks exist, inform: "All open tasks are already assigned to releases. Nothing to suggest." and stop.

**Step E2: Analyze and group**

For each unassigned task, extract:
- Task code and prefix (e.g., `SEC` from `SEC-116`)
- Section label (e.g., `section:core`, `section:zero-trust`)
- Priority label
- Dependencies (from task body)
- Description/title keywords

Group tasks using these criteria (in priority order):
1. **Dependency chains**: Tasks that depend on each other must be in the same release. If A depends on B, both go together (or B in an earlier release).
2. **Prefix affinity**: Tasks with the same code prefix (e.g., `SEC-*`) share a domain and are strong candidates for the same release.
3. **Section cohesion**: Tasks in the same section (e.g., all `section:zero-trust`) relate to the same project area.
4. **Description similarity**: Analyze titles/descriptions for thematic overlap — security features together, UI improvements together, etc.
5. **Priority cohesion**: HIGH priority tasks should go in the nearest release. LOW priority tasks can be deferred to later releases.

**Step E3: Determine version numbers**

For each suggested group:
- If the group contains tasks that would be `feat:` commits (new features), suggest a **minor** bump.
- If the group contains only bugfix-type tasks, suggest a **patch** bump.
- Use the current version to compute the next versions in sequence.

Read the current version from the "Current version" section and calculate:
```bash
python3 .claude/scripts/release_manager.py suggest-bump --current-version "$CURRENT_VERSION" --suggested-bump "$BUMP_TYPE"
```

**Step E4: Present suggestions**

Present each suggested release group:

```
=== Suggested Release Plan ===

--- Group 1: v1.4.0 (minor) ---
Theme: "Security Hardening & Data Protection"
Tasks:
  HIGH: SEC-116 — Data Loss Prevention on Clipboard and Drive
  MEDIUM: ZT-310 — Rate Limiting for API Endpoints
  MEDIUM: GUARD-312 — CSP Header Configuration
Reasoning: All tasks share the security/zero-trust domain and touch middleware/guard layers.

--- Group 2: v1.5.0 (minor) ---
Theme: "UI & Connection Management Improvements"
Tasks:
  MEDIUM: CTX-305 — Connection Quick Actions Toolbar
  LOW: TABS-308 — Tab Grouping by Connection Type
Reasoning: Both tasks improve the client-side connection management UX.
```

**Step E5: User confirmation**

Use `AskUserQuestion` with options:
- **"Apply all suggestions"** — create all suggested releases and assign tasks
- **"Review each group"** — present each group individually for confirmation/modification
- **"Cancel"** — abort without changes

STOP HERE after calling `AskUserQuestion`. Do NOT proceed until the user responds.

**If "Review each group":** For each group, use `AskUserQuestion`:
- **"Accept this group"** — create the release and assign tasks
- **"Modify"** — let the user add/remove tasks or change the version/theme
- **"Skip this group"** — leave these tasks unassigned

STOP HERE after each `AskUserQuestion`. Do NOT proceed until the user responds.

**Step E6: Execute**

For each confirmed group:
1. Create the release entry (same as `create` subcommand)
2. For each task in the group, run the `assign` flow (releases.json + label + milestone)

Report the total number of releases created and tasks assigned.

---

### Subcommand F: `timeline`

Detailed timeline view showing per-task status within each release.

1. Read the release plan data.
2. If no releases exist, inform the user and stop.
3. For each release (sorted by version):
   - List every task with its current status:

```
=== Release v1.4.0 — "Security Hardening" ===
Status: planned | Target: 2026-04-01 | Progress: 1/3 (33%)

  [x] SEC-116 — Data Loss Prevention on Clipboard and Drive (done)
  [~] ZT-310 — Rate Limiting for API Endpoints (in-progress)
  [ ] GUARD-312 — CSP Header Configuration (todo)

=== Release v1.5.0 — "UI Improvements" ===
Status: planned | Target: — | Progress: 0/2 (0%)

  [ ] CTX-305 — Connection Quick Actions Toolbar (todo)
  [ ] TABS-308 — Tab Grouping by Connection Type (todo)
```

4. To get each task's status:
   - **Platform-only mode:** Query the task's labels:
     ```bash
     gh issue list --repo "$TRACKER_REPO" --search "[TASK-CODE] in:title" --label task --json number,title,labels,state --jq '.[0]'
     ```
   - **Local/dual mode:**
     ```bash
     python3 .claude/scripts/task_manager.py parse TASK-CODE
     ```

---

## Important Rules

1. **NEVER modify tasks or releases without user confirmation** — always present drafts and wait for approval.
2. **releases.json is the single source of truth** for release plans. Platform labels/milestones are secondary and kept in sync.
3. **Version numbers use semver without `v` prefix** in `releases.json` (e.g., `1.4.0`, not `v1.4.0`). Platform labels use the prefix from config (e.g., `release:v1.4.0`).
4. **A task can only belong to one release at a time.** If reassigning, remove from the old release first.
5. **All output must be in English.**
6. **Backward compatibility:** If `releases.json` does not exist, all subcommands handle this gracefully (empty state, no errors).
7. **Platform operations are secondary** — if `gh`/`glab` commands fail for labels or milestones, warn but do not fail the operation. The local `releases.json` is always updated.
