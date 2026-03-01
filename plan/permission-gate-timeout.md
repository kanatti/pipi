# Permission Gate Timeout Enhancement

**Status**: Planning  
**Created**: 2026-02-28  
**Owner**: Balu  
**Related**: `extensions/permission-gate.ts`, `docs/ast-permission-gate.md`

---

## Problem Statement

### Current Behavior

The permission gate extension blocks potentially unsafe bash commands and prompts the user for approval via `ctx.ui.select()`. This creates two issues:

1. **Complex read-only commands get blocked unnecessarily**
   - Commands with process substitution: `comm -12 <(sort f1) <(sort f2)`
   - Commands with complex quoting: `docker ps --format "table {{.Names}}"`
   - Safe pipelines with xargs: `find . -name "*.md" | xargs grep pattern`

2. **Session hangs when user is away**
   - Agent waits indefinitely for user response
   - No timeout mechanism exists
   - User returns to find agent stuck on a blocked command
   - No way for agent to proceed autonomously

### Impact

- **Poor UX**: User must be present for all blocked commands, even safe ones
- **Lost productivity**: Long-running analysis sessions get stuck
- **Agent inefficiency**: Agent can't adapt or find alternatives
- **False positives**: Overly cautious blocking reduces automation value

---

## Goals

### Primary Goals

1. **Prevent indefinite blocking** when user is unavailable
2. **Enable agent autonomy** to find safer alternatives
3. **Maintain security** - don't auto-allow dangerous commands
4. **Preserve user control** - user can still approve when present

### Secondary Goals

5. **Collect data** on commonly blocked commands for future improvements
6. **Provide clear feedback** to user about what happened during timeout
7. **Support configuration** - users can adjust timeout duration
8. **Graceful degradation** - prevent timeout loops

### Non-Goals

- Replace the permission gate entirely
- Implement AST-based parsing (separate initiative)
- Add machine learning for command safety detection
- Support per-command timeout overrides

---

## Design

### Overview

Add a **configurable timeout** to permission prompts. After timeout:
1. Notify user the command was blocked
2. Ask agent to suggest safer alternatives or explain safety
3. Block the original command
4. Let agent retry with alternative or same command (with justification)
5. Auto-skip after multiple timeouts on same command

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Permission Gate Extension                                │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  1. isSafeBashCommand(cmd)                               │
│     ├─ Yes → Allow immediately                           │
│     └─ No → Continue to prompt                           │
│                                                           │
│  2. selectWithTimeout(msg, options, timeoutMs)           │
│     ├─ User responds → Handle choice                     │
│     └─ Timeout (10s) → handleTimeout()                   │
│                                                           │
│  3. handleTimeout(cmd, ctx, pi)                          │
│     ├─ Track retry attempts                              │
│     ├─ Notify user (visual feedback)                     │
│     ├─ Send message to agent with options:              │
│     │  • Suggest safer alternative                       │
│     │  • Explain why command is safe                     │
│     │  • Use different approach                          │
│     └─ Block command (return block: true)                │
│                                                           │
│  4. Agent responds with:                                 │
│     ├─ Alternative command → Triggers new tool_call      │
│     ├─ Same command + explanation → Timeout again        │
│     │   └─ After 2+ timeouts → Auto-skip                 │
│     └─ Different approach → Proceeds without bash        │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Timeout Wrapper

```typescript
async function selectWithTimeout(
    ctx: any,
    message: string,
    options: string[],
    timeoutMs: number
): Promise<string | "timeout">
```

**Responsibilities**:
- Wrap `ctx.ui.select()` with timeout
- Return "timeout" if user doesn't respond
- Clean up timer if user responds
- Handle cancellation/errors

**Edge Cases**:
- UI becomes available during timeout
- Multiple rapid timeouts
- User responds just as timeout fires

#### 2. Timeout Handler

```typescript
async function handleTimeout(
    blockedCommand: string,
    ctx: any,
    pi: ExtensionAPI
): Promise<{ block: true; reason: string }>
```

**Responsibilities**:
- Track retry attempts per command
- Send structured message to agent
- Provide clear guidance on options
- Auto-skip after threshold (default: 2 retries)
- Notify user with visual feedback

**State Management**:
- Use `Map<string, number>` for retry tracking
- Clear map on successful user response
- Reset on session boundaries

#### 3. Configuration

```typescript
interface PermissionGateConfig {
    timeoutMs: number;           // Default: 10000 (10s)
    timeoutEnabled: boolean;     // Default: true
    maxRetries: number;          // Default: 2
    logBlockedCommands: boolean; // Default: true
}
```

**Sources** (in priority order):
1. Environment variables: `PI_PERMISSION_TIMEOUT_MS`, `PI_PERMISSION_TIMEOUT_ENABLED`
2. `.pi/config.json`: `permissionGate` section
3. Hardcoded defaults

---

## Implementation Plan

### Phase 1: Core Timeout Mechanism (Week 1)

**Goal**: Basic timeout working with agent query

**Tasks**:
1. ✅ Write plan document (this doc)
2. ⬜ Implement `selectWithTimeout()` wrapper
3. ⬜ Implement `handleTimeout()` with retry tracking
4. ⬜ Integrate into bash command flow
5. ⬜ Add user notifications
6. ⬜ Write unit tests for timeout logic

**Success Criteria**:
- Timeout triggers after 10s with no response
- Agent receives structured message
- Command is blocked appropriately
- No crashes or hangs

**Deliverables**:
- Modified `extensions/permission-gate.ts`
- Test coverage for timeout paths
- Manual testing script

### Phase 2: Configuration & Polish (Week 2)

**Goal**: Production-ready with configurability

**Tasks**:
1. ⬜ Add environment variable support
2. ⬜ Add config file support
3. ⬜ Implement auto-skip after retries
4. ⬜ Add command logging (for analysis)
5. ⬜ Improve agent message clarity
6. ⬜ Write integration tests
7. ⬜ Update documentation

**Success Criteria**:
- Users can configure timeout via env vars
- Auto-skip prevents infinite loops
- Clear error messages and notifications
- Documentation is complete

**Deliverables**:
- Environment variable documentation
- Example config snippets
- Integration test suite
- Updated README section

### Phase 3: Metrics & Analysis (Week 3)

**Goal**: Collect data to improve safe command detection

**Tasks**:
1. ⬜ Log blocked commands to `.pi/permission-gate.log`
2. ⬜ Track timeout frequency
3. ⬜ Analyze common false positives
4. ⬜ Create report script to identify patterns
5. ⬜ Use data to expand safe command list

**Success Criteria**:
- Log file contains useful debugging info
- Can identify top 10 blocked safe commands
- Have actionable improvements for Phase 4

**Deliverables**:
- Logging implementation
- Analysis script
- Report on common patterns
- Recommendations for safe command expansion

### Phase 4: Enhanced Detection (Week 4+)

**Goal**: Reduce false positives based on collected data

**Tasks**:
1. ⬜ Add top 10 safe patterns from analysis
2. ⬜ Implement basic process substitution detection
3. ⬜ Add common safe flag patterns
4. ⬜ Write tests for new patterns
5. ⬜ Consider AST parser exploration

**Success Criteria**:
- 50% reduction in timeout frequency
- Complex read-only commands auto-allowed
- No new security vulnerabilities

**Deliverables**:
- Enhanced `isSafeBashCommand()` logic
- New test cases
- Performance benchmarks

---

## Detailed Design

### Timeout Flow Diagram

```
User Request → Agent calls bash tool → Permission Gate
                                              ↓
                                    Is command safe?
                                    ├─ Yes → Allow (no prompt)
                                    └─ No → Show prompt with timeout
                                              ↓
                              ┌───────────────┴───────────────┐
                              ↓                               ↓
                        User responds                    10s timeout
                        within 10s                       expires
                              ↓                               ↓
                    ┌─────────┴─────────┐          Increment retry count
                    ↓         ↓         ↓                     ↓
                 Allow     Skip      Abort            Is retry < 2?
                    ↓         ↓         ↓              ├─ Yes → Send agent message
              Execute   Block cmd   Abort session     │        "Suggest alternative"
                                                       │              ↓
                                                       │     Block command & wait
                                                       │              ↓
                                                       │     Agent tries alternative
                                                       │              ↓
                                                       │     New bash tool call
                                                       │              ↓
                                                       │     Back to "Is safe?" check
                                                       │
                                                       └─ No → Auto-skip
                                                               Notify user
                                                               Block permanently
```

### Message Template to Agent

```markdown
Your bash command is blocked waiting for user's permission approval:

```bash
{blockedCommand}
```

The user seems to be away and hasn't responded in {timeoutSec} seconds.

**Context**: This command was flagged as potentially unsafe by the permission gate.

**Your options**:

1. **Suggest a safer alternative** - If there's a read-only command that accomplishes 
   the same goal without the unsafe operations, suggest it now and I'll try to use it.
   
2. **Explain why this is safe** - If this command is actually safe (read-only, no writes,
   no deletions, no code execution), explain why. If you can justify its safety, provide
   the same command again and I'll wait for user approval.
   
3. **Use a different approach** - If you can accomplish the task using different tools
   (read, write, edit) or a different strategy, pivot to that instead.

**Attempt**: {attemptNum}/{maxRetries} (will auto-skip after max retries)

What would you like to do?
```

### Agent Response Patterns

#### Pattern 1: Safe Alternative
```
Agent: I can use a safer alternative command:

bash
$ find . -name "*.ts" -print0 | xargs -0 grep pattern

This avoids the -exec flag and uses xargs instead, which is whitelisted.
```

#### Pattern 2: Safety Justification
```
Agent: This command is actually safe because:
- `comm` only compares files (read-only)
- Process substitution `<(sort file)` runs safe `sort` command
- No file writes, deletions, or code execution

bash
$ comm -12 <(sort file1) <(sort file2)

Please approve when you return.
```

#### Pattern 3: Different Approach
```
Agent: I'll use a different approach instead of that bash command.

Let me use the `read` tool to examine the files individually:

read
path: file1.txt
```

### Retry Tracking Implementation

```typescript
interface RetryState {
    attempts: number;
    firstAttemptTime: number;
    lastCommand: string;
}

const retryMap = new Map<string, RetryState>();

function getRetryKey(command: string): string {
    // Normalize command for deduplication
    return command.trim().replace(/\s+/g, ' ');
}

function trackRetry(command: string): RetryState {
    const key = getRetryKey(command);
    const existing = retryMap.get(key);
    
    if (existing) {
        return {
            ...existing,
            attempts: existing.attempts + 1,
            lastCommand: command
        };
    }
    
    return {
        attempts: 1,
        firstAttemptTime: Date.now(),
        lastCommand: command
    };
}

function clearRetry(command: string): void {
    const key = getRetryKey(command);
    retryMap.delete(key);
}

// Cleanup: Clear retries older than 1 hour
setInterval(() => {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    
    for (const [key, state] of retryMap.entries()) {
        if (now - state.firstAttemptTime > ONE_HOUR) {
            retryMap.delete(key);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes
```

### Logging Format

```json
{
  "timestamp": "2026-02-28T14:30:15.123Z",
  "event": "timeout",
  "command": "find . -exec grep pattern {} \\;",
  "attempt": 1,
  "sessionId": "abc123",
  "cwd": "/Users/balu/Code/project",
  "agentResponse": "suggested_alternative"
}
```

---

## Configuration

### Environment Variables

```bash
# Disable timeout entirely (wait forever for user)
export PI_PERMISSION_TIMEOUT_ENABLED=false

# Set custom timeout duration (in milliseconds)
export PI_PERMISSION_TIMEOUT_MS=15000  # 15 seconds

# Set max retry attempts before auto-skip
export PI_PERMISSION_MAX_RETRIES=3

# Enable/disable command logging
export PI_PERMISSION_LOG_COMMANDS=true

# Custom log file location
export PI_PERMISSION_LOG_FILE="$HOME/.pi/blocked-commands.log"
```

### Configuration File

`.pi/config.json`:
```json
{
  "permissionGate": {
    "timeoutMs": 10000,
    "timeoutEnabled": true,
    "maxRetries": 2,
    "logCommands": true,
    "logFile": "~/.pi/permission-gate.log",
    "notifyOnTimeout": true
  }
}
```

### Defaults

```typescript
const DEFAULT_CONFIG = {
    timeoutMs: 10000,        // 10 seconds
    timeoutEnabled: true,
    maxRetries: 2,           // Auto-skip after 2 timeouts
    logCommands: true,
    logFile: "~/.pi/permission-gate.log",
    notifyOnTimeout: true
};
```

---

## Testing Strategy

### Unit Tests

**File**: `test/permission-gate-timeout.test.ts`

```typescript
describe("selectWithTimeout", () => {
    it("returns user choice when responded within timeout");
    it("returns 'timeout' after timeout expires");
    it("cleans up timer on user response");
    it("handles errors during user selection");
});

describe("handleTimeout", () => {
    it("sends message to agent on first timeout");
    it("increments retry counter on subsequent timeouts");
    it("auto-skips after max retries");
    it("notifies user appropriately");
    it("clears retry state on successful response");
});

describe("retry tracking", () => {
    it("tracks retry attempts per command");
    it("normalizes similar commands");
    it("cleans up old retry state");
    it("distinguishes different commands");
});
```

### Integration Tests

**File**: `test/permission-gate-integration.test.ts`

```typescript
describe("Permission Gate Integration", () => {
    it("full flow: timeout → agent message → alternative command");
    it("full flow: timeout → timeout → auto-skip");
    it("full flow: user responds before timeout");
    it("configuration via env vars works");
    it("logging captures blocked commands");
});
```

### Manual Testing Scenarios

**Scenario 1: Normal timeout flow**
1. Start pi session
2. Trigger blocked command: `find . -exec rm {} \;`
3. Don't respond to prompt
4. After 10s, verify:
   - User sees notification
   - Agent receives message
   - Command is blocked
5. Agent suggests alternative
6. Verify alternative is evaluated

**Scenario 2: Multiple timeouts**
1. Trigger blocked command
2. Wait for timeout
3. Agent provides same command with explanation
4. Wait for second timeout
5. Verify auto-skip after 2nd timeout

**Scenario 3: User responds during retry**
1. Trigger blocked command
2. Wait for timeout (agent gets message)
3. User returns and clicks "Allow" on retry
4. Verify command executes

**Scenario 4: Configuration**
1. Set `PI_PERMISSION_TIMEOUT_MS=5000`
2. Trigger blocked command
3. Verify timeout after 5s (not 10s)

---

## Metrics & Success Criteria

### Success Metrics

**Phase 1** (Core Implementation):
- ✅ Zero crashes related to timeout mechanism
- ✅ 100% of timeouts result in agent message
- ✅ User can still approve commands when present

**Phase 2** (Production Ready):
- ✅ Configuration works across env vars and config file
- ✅ Auto-skip prevents infinite loops
- ✅ Clear user feedback in all timeout scenarios

**Phase 3** (Data Collection):
- ✅ Log file contains ≥50 command samples
- ✅ Can identify top 10 blocked commands
- ✅ Timeout rate measured and tracked

**Phase 4** (Improvements):
- 🎯 50% reduction in timeout frequency
- 🎯 ≥10 new safe command patterns added
- 🎯 No security regressions

### Performance Targets

- Timeout overhead: <5ms when user responds quickly
- Memory: <1MB for retry state tracking
- Log file: <10MB over typical session

---

## Risks & Mitigations

### Risk 1: Agent suggestion loops

**Description**: Agent keeps suggesting slightly different versions of same unsafe command

**Mitigation**:
- Normalize commands for deduplication (`getRetryKey()`)
- Auto-skip after 2 retries regardless of variation
- Clear messaging about retry count to agent

### Risk 2: Timeout too aggressive

**Description**: 10s too short for users to read complex commands

**Mitigation**:
- Make timeout configurable
- Default to 10s (reasonable for most cases)
- Document how to increase timeout
- Consider longer timeout for very long commands

### Risk 3: Race conditions

**Description**: User responds exactly as timeout fires

**Mitigation**:
- Use `resolved` flag in promise
- Clean up timer properly
- Test edge cases explicitly

### Risk 4: Memory leaks

**Description**: Retry map grows unbounded

**Mitigation**:
- Periodic cleanup of old entries (every 5 min)
- Clear on session boundaries
- Limit map size (warn if >1000 entries)

### Risk 5: False sense of security

**Description**: Users rely on timeout instead of fixing safe command detection

**Mitigation**:
- Phase 3 focuses on data collection
- Phase 4 improves detection based on data
- Treat timeout as fallback, not primary mechanism

### Risk 6: Log file growth

**Description**: Log file grows too large over time

**Mitigation**:
- Implement log rotation (keep last 1000 entries)
- Make logging optional (env var)
- Document log location and cleanup

---

## Future Enhancements

### Post-MVP Improvements

1. **Smart timeout scaling**
   - Longer timeout for complex/long commands
   - Shorter timeout for repeated patterns
   - Adaptive based on user response patterns

2. **User preference learning**
   - Track which commands user always approves
   - Suggest adding to safe list
   - Auto-generate custom policy rules

3. **Enhanced agent guidance**
   - Provide examples of similar safe commands
   - Show command safety analysis in message
   - Link to documentation about why command was blocked

4. **Better retry logic**
   - Allow agent to request "wait longer" explicitly
   - Support "remind me in 30s" option
   - Distinguish between "user away" vs "user reviewing"

5. **Integration with AST parser**
   - Use AST analysis to explain why command is unsafe
   - Provide specific guidance on what makes it dangerous
   - Suggest specific safe modifications

6. **UI improvements**
   - Show countdown timer in prompt
   - "Still here?" button to reset timeout
   - Visual indicator when agent is waiting for timeout

---

## Open Questions

1. **Should timeout apply to all blocked tools or just bash?**
   - Current: Only bash has complex safety logic
   - Future: `edit` and `write` outside CWD also block
   - Decision: Start with bash, extend to others in Phase 2

2. **Should we log agent's suggested alternatives?**
   - Pros: Learn what alternatives work
   - Cons: Larger log files, more complexity
   - Decision: Log in Phase 3 for analysis, optional in production

3. **What if user has no UI (print mode)?**
   - Current: Commands auto-block with no UI
   - With timeout: Still auto-block (timeout requires UI to make sense)
   - Decision: Timeout only applies when `ctx.hasUI === true`

4. **Should retry count be per-command or per-session?**
   - Per-command: Different commands get separate retry budgets
   - Per-session: Prevents abuse of retry system
   - Decision: Per-command (current design), with session-wide circuit breaker

5. **How to handle multi-line commands?**
   - Display: Show full command or truncate?
   - Logging: Store original or normalized?
   - Decision: Display first 200 chars, log full command

---

## References

- Current implementation: `extensions/permission-gate.ts`
- Test suite: `test/permission-gate.test.ts`
- AST enhancement plan: `docs/ast-permission-gate.md`
- Pi extension API: `.pi/skills/pi-extension-dev/SKILL.md`
- Safe command patterns: `extensions/permission-gate.ts` (lines 30-85)

---

## Changelog

- **2026-02-28**: Initial plan created
- **TBD**: Implementation started (Phase 1)
- **TBD**: Configuration added (Phase 2)
- **TBD**: Metrics collection (Phase 3)
- **TBD**: Enhanced detection (Phase 4)
