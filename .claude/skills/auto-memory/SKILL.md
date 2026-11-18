---
name: auto-memory
description: Persistent per-project knowledge base under .claude/memory/ — saves high-signal, durable, non-obvious facts (corrections, decisions, investigation outcomes, gotchas, business context) into a nested tree of topic folders with indexes, and recalls relevant entries before a task. Triggers on - remember this, don't forget, save to memory, make a note, important, take note, recall, what do you know about, what do you remember, forget this, update memory. Also runs at the start of any task that touches the project, preferences, ongoing work, or decisions.
---

# Auto Memory

A small, per-project set of high-value reference notes, organized as a tree of topic folders with indexes so the right entry is found without bulk-loading. Its purpose: the next session starts with the context it needs, does not repeat research already done, and does not repeat known mistakes. Memory records **current truth**, never history.

**Shared with the team.** `.claude/memory/` is tracked in git, so every teammate's agent loads it. Save team facts only. A preference or profile detail of one developer goes to that developer's user-level memory (`~/.claude/projects/<project>/memory/`), not here.

**Current branch only.** Memory is read and verified against the working tree of the current branch. Never look up other branches or their memory. If the current code does not confirm a memory, investigate again on this branch.

## Storage layout

Indexes form a tree. Each index lists only its direct children; the agent follows index links down until it reaches the entry it needs.

```text
.claude/memory/
├── INDEX.md                 # root: links to folder indexes only, never to entries
├── feedback/
│   ├── INDEX.md             # lists the entries in this folder
│   └── pr-style.md
└── project/
    ├── INDEX.md             # lists subfolder indexes only, because this folder has subfolders
    ├── devcontainer/
    │   ├── INDEX.md
    │   └── firewall-dns-rotation.md
    └── caching/
        ├── INDEX.md
        └── lkg-key-collision.md
```

- **Root index:** one line per top-level folder — link to its `INDEX.md`, what it covers, keywords. Never a link to an entry.
- **Folder index:** one line per direct child. A folder holds either entries or subfolders, not both. Every folder has one.
- **Split when large:** when a folder index passes ~25 lines, move all its entries by subtopic into new subfolders, each with its own `INDEX.md`; the folder index then lists only the subfolders.
- **Folders:** lowercase kebab-case, named by topic. Reuse an existing folder before creating one (walk the indexes to avoid `feelings/` + `mood/` drift).
- **Lazy creation:** create folders on the first write; no empty scaffolding. If the directory cannot be created, tell the user and suggest another location.
- **Slugs:** name the topic, never a date (the date lives in `updated:`), and are unique across the whole tree, so `[[slug]]` links survive when files move. Find a slug with `find .claude/memory -name '<slug>.md'`.

## When to save

**Always** when the user signals it: "remember this", "don't forget", "save to memory", "make a note", "important — …", "for future reference".

**Also** when you detect a durable, non-obvious fact:
- Corrections the user makes to your approach — with the reason
- Validated approaches — when the user approves a non-obvious choice
- Decisions and trade-offs, especially business decisions the code cannot show — with their `source:`
- Investigation outcomes: what was checked, the conclusion, the evidence — including ruled-out causes and rejected options, so the next session does not redo the research
- Flows that take research across many files to rebuild: the conclusion and file pointers, not copies of code
- Project context not in the code: business goals, deadlines, external system quirks
- Gotchas: "X fails because Y" — the failure mode and how to avoid it, not the story of when it happened

**Do NOT save:**
- Anything one file read, `git log`, or `git blame` already shows
- Ephemeral task state or work-in-progress, including what lives on an unmerged branch (use a todo list)
- Speculation or anything you're not confident about
- Secrets, tokens, credentials
- One developer's personal preferences (user-level memory, see above)
- Duplicates — update the existing entry instead
- History: changelogs, superseded states, "originally X, then Y", or incident/violation logs (dated "Repeat Violation" or "Update (same day)" sections). A rejected option with its reason is a decision, not history — save it.

Paths and commands are fine when they are the fact itself (a kill recipe, a config location). When in doubt, **don't save**.

## How to save

### 1. The entry — `.claude/memory/<folder>/[<subfolder>/]<slug>.md`

```markdown
---
name: <slug>
description: <one specific line, used for index matching>
keywords: [retrieval, terms]
source: <Jira key, PR number, or who decided — required for business decisions>
updated: YYYY-MM-DD
---

### Rule / Fact
<the current truth, unambiguous>

### Why
<the reason — constraint, preference, failure mode, evidence; rejected options with their reason>

### How to apply
<when it kicks in; gotchas as short bullets>

Related: [[other-slug]]
```

- Use the actual current date. Omit `source:` when there is none.
- **At most ~400 words per entry.** If a topic needs more, split it into focused entries linked with `Related:`.
- A `Why` is required for feedback, decisions, and project entries.
- Older entries use `### Context & Why` / `### Practical Impact` headings. When you edit one, rename them to `### Why` / `### How to apply` and add the missing frontmatter fields.

### 2. The indexes — same write, every time

- **Add or delete an entry:** update the `INDEX.md` of its folder.
- **Add, delete, split, or rescope a folder:** also update the parent index line that points to it, up to the root.
- **Entry summary changed:** fix its line in the folder index.

One line per child, under ~150 chars, keyword-rich:

```markdown
<!-- root INDEX.md -->
- [feedback/](feedback/INDEX.md) — corrections and working rules from the team. tags: style, pr, review, process

<!-- feedback/INDEX.md -->
- [pr-style](pr-style.md) — small focused PRs, no trailing summaries. tags: pr, review, style
```

### Consolidate — avoid sprawl

Before creating a file, check whether the finding is narrow (one component, one cause, one fix). If so, add a bullet to an existing evergreen file for that topic (e.g. a checklist), matched by its `keywords`. Create a separate file only for a real investigation (several measurements, trade-offs, open items), and link it from the checklist with a one-line `- **<rule>.** … see [[slug]]` bullet.

## When to retrieve

At the start of **every** task, even simple-looking ones:

1. If `.claude/memory/INDEX.md` does not exist, skip.
2. Read the root `INDEX.md`. Open the folder indexes that match the task, and follow their links deeper until you reach the matching entries.
3. Read **only** the matching entries. Never bulk-load a folder.
4. Check the facts you will act on against the current code and config. If they conflict, the code wins — fix or delete the entry now, and its index line.

For recall requests ("what do you remember about X"), walk the indexes the same way and read the entries whose description or keywords match X.

## Updating and forgetting

- **Update in place.** Overwrite or delete outdated content; state only the current reality. Bump `updated:` and fix the index line if the summary changed.
- **Corrections and repeated mistakes** — rewrite the entry so it reads as one current rule; never append a dated incident section:
  1. Merge the new requirement into `Rule / Fact`. If it overrides an older line, replace that line.
  2. Add each new failure mode as a short bullet under `How to apply` (trigger + fix), with no date or story.
  3. If a rule keeps being broken, raise its weight where it is always loaded (mark it **IMPORTANT** in `AGENTS.md`/`CLAUDE.md`), not by counting violations in memory.
- **Forget** on request ("forget X", "we don't do Y anymore"): delete the file and its index line; confirm in the reply.
- **Prune** whenever an entry is loaded: if it references a file, function, or decision that no longer exists on the current branch, remove it.
- **Resolved issues:** when a tracked bug is fixed, delete the entry (or the resolved part) — never mark it "RESOLVED"/"FIXED". Keep only a durable lesson, if one exists.

## Confirmation

- **Explicit save:** save, then give the path.
- **Auto-detected save:** save, then one short line, e.g. `Noted in memory/feedback/pr-style.md.`
- **Recall:** mention loaded memory only when it changed your approach.

## Anti-patterns

- Essays instead of reference notes (over ~400 words)
- Saving what one file read already shows
- A root index that lists entries instead of folder indexes
- A folder index past ~25 lines that was not split
- A new folder when an existing one fits
- A stale index — every write, update, or delete touches the indexes on its path
- Feedback or decisions without a `Why`; business decisions without a `source:`
- Personal preferences of one developer in the shared team memory
- Looking up other branches to verify a memory
- History in memory: change logs, "RESOLVED" markers, violation counts
