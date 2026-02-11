# Spec Implementation Process

Now that we have a spec and tasks list ready for implementation, we will proceed with implementation of this spec by following this multi-phase process:

PHASE 0: Load session state and context
PHASE 1: Plan the subagent assignments for each task group
PHASE 2: Delegate implementation of each task group to its assigned subagent
PHASE 3: Delegate verifications of the implementation to verifier subagents
PHASE 4: Delegate the production of the final verification
PHASE 5: Update session state

Follow each of these phases and their individual workflows IN SEQUENCE:

## Command Flags

This command supports the following optional flags:
- `--fresh-agent` - Force spawning a fresh agent for the next task group (useful for context management)
- `--context-report` - Display context summary before proceeding with implementation

## Multi-Phase Process

### PHASE 0: Load session state and context

Read `agent-os/STATE.md` to understand the current project state:

1. **Review Session Context**: Understand where work left off in previous sessions
2. **Check Active Blockers**: Identify any blockers that may affect the current spec
3. **Review Key Decisions**: Note any relevant decisions that apply to this implementation
4. **Review Patterns Established**: Use established patterns to maintain consistency

If the `--context-report` flag is provided, display a summary of:
- Current session context
- Active blockers relevant to this spec
- Recent key decisions
- Established patterns that apply

Store the current spec folder path for later STATE.md updates.

---

### PHASE 1: Plan subagents assignments

Read the following files:
- `agent-os/specs/[this-spec]/tasks.md`
- `agent-os/roles/implementers.yml`

Create `agent-os/specs/[this-spec]/planning/task-assignments.yml` with this structure:

```yaml
task_assignments:
  - task_group: "Task Group 1: [Title from tasks.md]"
    assigned_subagent: "[implementer-id-from-implementers.yml]"

  - task_group: "Task Group 2: [Title from tasks.md]"
    assigned_subagent: "[implementer-id-from-implementers.yml]"

  # Continue for all task groups found in tasks.md
```

Ensure each assigned subagent exists in both of these locations:
- In implementers.yml there must be an implementer with this role ID.
- In `.claude/agents/agent-os` there must be a file named by this implementer ID.

### PHASE 2: Delegate task groups implementations to assigned subagents

Loop through each task group in `agent-os/specs/[this-spec]/tasks.md` and delegate its implementation to the assigned subagent specified in `task-assignments.yml`.

For each delegation, provide the subagent with:
- The task group (including the parent task and all sub-tasks)
- The spec file: `agent-os/specs/[this-spec]/spec.md`
- **Relevant STATE.md context:**
  - Any active blockers related to this task group
  - Key decisions that may affect implementation
  - Established patterns to follow
- Instruct subagent to:
  1. Perform their implementation
  2. Check off the task and sub-task(s) in `agent-os/specs/[this-spec]/tasks.md`
  3. Document their work in an implementation report named and numbered by this task name and placed in `agent-os/specs/[this-spec]/implementation/`.
  4. Report any new blockers discovered during implementation
  5. Report any new patterns established during implementation

#### Context Advisory

After completing each task group, track the count of completed task groups in this session.

When the configured `warn_after_task_groups` threshold is reached (default: 3), display:
```
Context Advisory: [N] task groups completed in this session.
Consider using fresh agents for remaining tasks.
Use --fresh-agent flag to spawn a fresh agent for the next task group.
```

If `--fresh-agent` flag is active OR if running in `thorough` mode:
- Spawn a fresh agent for the next task group
- Provide the fresh agent with:
  - STATE.md content (session context, decisions, blockers)
  - Current task group from tasks.md
  - Path to spec.md
  - List of completed task groups (names only, not implementation details)

### PHASE 3: Delegate verifications of implementation to verifier subagents

1. Collect the list of subagent IDs that were delegated to in Phase 2.

2. Read `implementers.yml` and find those subagent IDs. Collect the verifier role IDs specified in their `verified_by` field.

3. If there are verifier roles, ensure those verifiers are defined in `agent-os/roles/verifiers.yml`.

4. If there are verifier roles, delegate to each verifier subagent:
   - Collect all task groups that fall under the purview of this verifier (i.e. these tasks' implementers' verified_by specifies this verifier).
   - Provide to the verifier:
     1. Details of those task groups (parent task and sub-tasks) to the verifier for verification.
     2. The spec file: `agent-os/specs/[this-spec]/spec.md` for context.
   - Instruct the verifier:
     1. Read and analyze these tasks and where they fit in the context of this spec.
     2. Run tests to verify implementation of these tasks.
     3. Verify whether `agent-os/specs/[this-spec]/tasks.md` has been updated to reflect these tasks' completeness.
     4. Document your verification report and place this document in: `agent-os/specs/[this-spec]/verification/`

### PHASE 4: Produce the final verification report

Use the **implementation-verifier** subagent to do its implementation verification and produce its final verification report.

Provide to the subagent the following:
- The path to this spec: `agent-os/specs/[this-spec]`
Instruct the subagent to do the following:
  1. Run all of its final verifications according to its built-in workflow
  2. Produce the final verification report in `agent-os/specs/[this-spec]/verifications/final-verification.md`.

### PHASE 5: Update session state

Update `agent-os/STATE.md` to reflect the completed implementation session:

1. **Update Last Updated timestamp**: Set to current date/time

2. **Update Active Spec**: Set to the spec folder that was just implemented

3. **Update Session Context**: Write 2-3 sentences summarizing:
   - What spec was implemented
   - Overall outcome (success, partial, issues)
   - What should be done next

4. **Add Key Decisions**: If any significant decisions were made during implementation, add them to the Key Decisions table with:
   - Date
   - Decision made
   - Rationale
   - Spec/Context reference

5. **Update Blockers**:
   - Move any resolved blockers from Active to Resolved Blockers table
   - Add any new blockers discovered during implementation to Active Blockers

6. **Add Patterns Established**: If any new patterns were discovered or established during implementation, add them to the Patterns Established section

7. **Add Session Log Entry**: Add a new entry with:
   - Current date and session number
   - Summary of what was done (task groups completed, verifications run)
   - Next steps for future sessions

**Pruning**: If any section exceeds the configured limits in `config.yml`:
- `max_decisions`: Keep only the most recent N decisions
- `max_resolved_blockers`: Keep only the most recent N resolved blockers
- `max_session_logs`: Keep only the most recent N session log entries
