# Agent Implementation Protocol

> **For AI Coding Agents** — Protocol for implementing features in Nino Chavez Gallery using coordinated multi-agent workflows.

## Overview

This document provides a protocol for AI agents to safely implement features without conflicts. The strategy uses **file ownership zones** and **phased execution** to enable parallel work where possible.

---

## Critical: Execution Order

When implementing multiple features, follow this phased approach:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: PARALLEL (Safe - orthogonal features)                              │
│                                                                             │
│   Agent A: UI Enhancement       Agent B: Performance                        │
│   ├── src/lib/components/*      ├── src/routes/**/+page.server.ts          │
│   ├── src/app.css              ├── src/lib/supabase/server.ts              │
│   └── Styling changes           └── Query optimization                      │
│                                                                             │
│   These touch DIFFERENT file groups and can safely run in parallel.         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: MERGE & VERIFY (Human checkpoint)                                  │
│                                                                             │
│   • Merge branches                                                          │
│   • Run npm run check && npm run build                                     │
│   • Visual verification of UI changes                                       │
│   • Performance verification with Chrome DevTools                           │
│   • HUMAN APPROVAL REQUIRED before Phase 3                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: SERIAL (Dependency - needs merged code)                            │
│                                                                             │
│   Agent C: Integration Features                                             │
│   ├── Features that depend on merged UI + performance                       │
│   ├── Admin features (needs auth foundation)                               │
│   └── Cross-cutting concerns                                                │
│                                                                             │
│   MUST run AFTER merge because it depends on final state.                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Ownership Zones

### Zone Map

| Zone | Files | Typical Work |
|------|-------|--------------|
| **UI Components** | `src/lib/components/**/*.svelte` | Component styling, layout, animations |
| **Server Logic** | `src/routes/**/+page.server.ts` | Data loading, queries, transformations |
| **Database** | `src/lib/supabase/**` | Query functions, type transformations |
| **Styling** | `src/app.css`, `tailwind.config.ts` | Design tokens, global styles |
| **Types** | `src/types/**` | Type definitions |
| **Utils** | `src/lib/utils/**` | Utility functions |
| **Config** | `*.config.*`, `package.json` | Build/dev configuration |

### Conflict Zones (Coordinate Access)

These files are touched by multiple concerns and require coordination:

| File | Reason | Protocol |
|------|--------|----------|
| `src/lib/supabase/server.ts` | Central data access | One agent at a time |
| `src/app.css` | Global styles | Append-only additions preferred |
| `src/routes/+layout.server.ts` | Root data loading | Coordinate changes |
| `package.json` | Dependencies | Explicit approval for new deps |

---

## Feature Implementation Checklist

### Before Starting

```markdown
## Pre-Implementation Checklist

- [ ] Read relevant existing code (don't assume patterns)
- [ ] Check CLAUDE.md for project conventions
- [ ] Identify file ownership zone
- [ ] Verify no conflicting work in progress
- [ ] Create feature branch: `feature/[description]`
```

### During Implementation

```markdown
## Implementation Checklist

- [ ] Follow Svelte 5 runes (not legacy patterns)
- [ ] Use existing utilities (transformPhotoRow, getOptimizedSmugMugUrl)
- [ ] Parallelize independent queries with Promise.all
- [ ] Add aspect-ratio to new image containers (CLS prevention)
- [ ] Use Tailwind utilities (not custom CSS for common patterns)
- [ ] Handle error cases with appropriate fallbacks
```

### Before Marking Complete

```markdown
## Validation Checklist

- [ ] npm run check passes (zero errors)
- [ ] npm run build succeeds
- [ ] Visual verification (no layout shifts, correct styling)
- [ ] Performance check (no regression in TTFB/LCP)
- [ ] Mobile responsive check
```

---

## Handoff Protocol

When handing off work to another agent or human, create a handoff note:

### Handoff Template

```markdown
# Handoff: [Feature Name]

## Status
- [ ] In Progress / [ ] Complete / [ ] Blocked

## Completed Tasks
1. Task description
2. Task description

## Files Modified
- `path/to/file.ts` - Description of changes
- `path/to/file.svelte` - Description of changes

## In Progress / Blockers
- Description of any blocking issues

## Testing Status
- [ ] npm run check passes
- [ ] npm run build passes
- [ ] Manually verified: [describe what was tested]

## Next Steps
1. Remaining task
2. Remaining task

## Notes for Next Agent
- Any context needed for continuation
```

### Handoff Location

Store handoff notes in `.claude/handoff-[feature].md`

---

## Common Feature Patterns

### Pattern 1: New Gallery View

**Files to modify:**
- `src/routes/[route]/+page.server.ts` - Data loading
- `src/routes/[route]/+page.svelte` - UI component

**Key requirements:**
- Use `parent()` for cached sports/categories
- Use `transformPhotoRow()` for photo data
- Add PhotoGridSkeleton for loading state
- Include pagination if >24 items

### Pattern 2: Component Enhancement

**Files to modify:**
- `src/lib/components/[category]/[Component].svelte`

**Key requirements:**
- Maintain existing Props interface
- Use Svelte 5 event syntax (`onclick=` not `on:click=`)
- Add `event.stopPropagation()` for nested interactive elements
- Use Tailwind utilities for styling

### Pattern 3: Performance Optimization

**Files to modify:**
- `src/routes/**/+page.server.ts` - Query optimization
- `database/performance-indexes.sql` - New indexes

**Key requirements:**
- Profile before/after with Chrome DevTools
- Document improvements in `.temp/reports/`
- Parallelize queries with Promise.all
- Use database indexes for filtered queries

### Pattern 4: Filter/Search Enhancement

**Files to modify:**
- `src/routes/explore/+page.server.ts` - Query logic
- `src/lib/components/filters/*.svelte` - Filter UI

**Key requirements:**
- Maintain URL param compatibility
- Update filter counts if adding new filter
- Test with various filter combinations
- Verify mobile responsiveness

---

## Error Handling Protocol

### When Errors Occur

1. **TypeScript errors**: Fix before proceeding, never use `any` as workaround
2. **Build errors**: Do not mark task complete with build errors
3. **Runtime errors**: Add try/catch with appropriate fallback
4. **Performance regression**: Investigate and fix before merging

### Error Response Template

```markdown
## Error Encountered

**Type:** TypeScript / Build / Runtime / Performance
**Location:** `path/to/file.ts:line`

**Error Message:**
```
Paste error message here
```

**Root Cause Analysis:**
- Why this error occurred

**Fix Applied:**
- What was changed to fix it

**Verification:**
- How the fix was verified
```

---

## Communication Protocol

### When to Ask for Human Input

1. **Architecture decisions** - New patterns or significant refactors
2. **Dependency additions** - Any new npm packages
3. **Database changes** - Schema modifications
4. **Breaking changes** - Changes affecting existing functionality
5. **Uncertainty** - When unsure about the right approach

### Status Updates

Provide status updates at these checkpoints:

1. **Task Start**: What you're about to do
2. **Significant Progress**: After completing major subtasks
3. **Blockers**: Immediately when blocked
4. **Completion**: Summary of what was done

---

## Quality Standards

### Code Quality

| Standard | Requirement |
|----------|-------------|
| TypeScript | Strict mode, no `any` without justification |
| Svelte | Runes only (no legacy patterns) |
| CSS | Tailwind utilities preferred |
| Performance | No LCP regression, CLS < 0.1 |
| Tests | Unit tests for complex logic |

### Documentation

- Update relevant docs if behavior changes
- Add JSDoc comments for complex functions
- Include examples in utility functions

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) — Development guidelines
- [CODE_REVIEW.md](./CODE_REVIEW.md) — Review process
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture
- [CODING_STANDARDS.md](./CODING_STANDARDS.md) — Code conventions
