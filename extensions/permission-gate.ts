/**
 * Permission Gate
 *
 * Controls which tool calls require user confirmation before executing.
 *
 * - `read` - always allowed
 * - `bash` - allowed for safe read-only commands (ls, cat, find, git status, gh repo view, ktools yt-transcript, etc.)
 * - `write`, `edit` - require confirmation
 * - Other tools - require confirmation
 *
 * Uses a policy pipeline to check bash commands for safety. Easy to extend with more
 * safe commands by updating the configuration at the top of this file.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Configuration
// ============================================================================

// Safe read-only commands that can run without confirmation
const safeBashCommands = new Set([
    "ls",
    "cat",
    "cd",
    "grep",
    "find",
    "pwd",
    "echo",
    "which",
    "head",
    "tail",
    "less",
    "more",
    "wc",
    "file",
    "stat",
    "printenv",
    "jq",
    "cut",
    "sort",
    "uniq",
]);

// Commands that need subcommand checking (first word -> allowed second words)
// Easy to extend with more commands like: git, docker, kubectl, etc.
const safeSubcommands: Record<string, Set<string>> = {
    git: new Set([
        "log",
        "show",
        "diff",
        "status",
        "branch",
        "remote",
        "ls-files",
        "ls-tree",
        "blame",
        "describe",
        "tag",
    ]),
    jar: new Set([
        "-tf",    // list contents of file
        "-t",     // list contents  
        "--list", // list contents (long form)
    ]),
    // Add more here as needed, e.g.:
    // "docker": new Set(["ps", "images", "inspect", "logs"]),
};

// Special handling for gh CLI (format: gh <resource> <action>)
const safeGhActions = new Set(["view", "list", "show", "search", "status", "diff", "checks", "watch"]);
const safeGhResources = new Set(["repo", "pr", "issue", "release", "run", "workflow", "gist"]);

// Safe ktools commands (format: ktools <tool> <action>)
const safeKtoolsActions = new Set(["list", "get", "chapters"]);
const safeKtoolsTools = new Set(["yt-transcript"]);

// ============================================================================
// Policy Checking
// ============================================================================

/**
 * Policy checker function type.
 * Returns true if the command passes the policy check.
 */
type PolicyChecker = (words: string[]) => boolean;

/**
 * Policy 1: Check if first word is a simple safe command.
 */
const checkSimpleSafeCommand: PolicyChecker = (words) => {
    return safeBashCommands.has(words[0]);
};

/**
 * Policy 2: Check if it's a compound command with safe subcommand.
 */
const checkSafeSubcommand: PolicyChecker = (words) => {
    const firstWord = words[0];
    const secondWord = words[1];

    if (firstWord in safeSubcommands) {
        return !!secondWord && safeSubcommands[firstWord].has(secondWord);
    }
    return false;
};

/**
 * Policy 3: Check if it's a safe gh command.
 * gh commands have format: gh <resource> <action> or gh --flag
 */
const checkSafeGhCommand: PolicyChecker = (words) => {
    if (words[0] !== "gh") {
        return false;
    }

    const secondWord = words[1];

    // Handle flags like: gh --version
    if (secondWord?.startsWith("--")) {
        return secondWord === "--version";
    }

    // Handle resource commands like: gh repo view, gh pr list
    const thirdWord = words[2];
    return !!secondWord && !!thirdWord && safeGhResources.has(secondWord) && safeGhActions.has(thirdWord);
};

/**
 * Policy 4: Check if it's a safe ktools command.
 * ktools commands have format: ktools <tool> <action> [args]
 * Example: ktools yt-transcript list VIDEO_ID
 */
const checkSafeKtoolsCommand: PolicyChecker = (words) => {
    if (words[0] !== "ktools") {
        return false;
    }

    const tool = words[1];
    const action = words[2];

    return !!tool && !!action && safeKtoolsTools.has(tool) && safeKtoolsActions.has(action);
};

/**
 * Policy 5: Check if it's a safe xargs command.
 * xargs commands have format: xargs [flags] command [command-args]
 * The safety depends on the command that xargs will execute.
 * Example: xargs grep pattern (safe), xargs rm (unsafe)
 */
const checkSafeXargsCommand: PolicyChecker = (words) => {
    if (words[0] !== "xargs") {
        return false;
    }

    let i = 1;
    while (i < words.length && words[i].startsWith('-')) {
        const flag = words[i];
        i++;
        
        // Flags that take an argument
        if (['-I', '-i', '-n', '-s', '-P', '-L', '-l'].includes(flag)) {
            if (i >= words.length) {
                return false; // Malformed: flag missing its argument, ask for permission
            }
            i++; // Skip the flag's argument
        }
        // Other flags like -p, -0, -r, -t don't take arguments
    }
    
    if (i >= words.length) {
        return false; // No command found after xargs flags, ask for permission
    }
    
    // Now we have the actual command, check if it's safe
    const actualCommand = words.slice(i);
    return isCommandSafe(actualCommand.join(' '));
};

// Pipeline of policy checks - add more policies here as needed
const policyChecks: PolicyChecker[] = [
    checkSimpleSafeCommand,
    checkSafeSubcommand,
    checkSafeGhCommand,
    checkSafeKtoolsCommand,
    checkSafeXargsCommand,
    // Add more policies here, e.g.:
    // checkSafeFlagsOnly,
    // checkReadOnlyOperations,
];

/**
 * Check if a command part passes any of the policy checks.
 */
function isCommandSafe(commandPart: string): boolean {
    const words = commandPart.split(/\s+/).filter((w) => w.length > 0);

    if (words.length === 0) {
        return false;
    }

    // Pass if ANY policy check succeeds
    return policyChecks.some((policy) => policy(words));
}

// ============================================================================
// Shell Command Safety Checking
// ============================================================================

/**
 * Check if a character is a dangerous shell metacharacter.
 */
function isDangerousChar(char: string): boolean {
    // Dangerous shell metacharacters:
    // < > : redirects
    // ` : command substitution
    // $ : variable expansion / command substitution
    // ( ) : subshells
    // { } : brace expansion
    return /[<>`$(){}]/.test(char);
}

/**
 * State for tracking position in a shell command during parsing.
 */
interface ParseState {
    inSingleQuote: boolean;
    inDoubleQuote: boolean;
    escaped: boolean;
}

/**
 * Advance the parser by one character, updating state.
 * Returns true if the character is "active" (not quoted/escaped), false otherwise.
 */
function advanceParser(char: string, state: ParseState): boolean {
    // Handle escape sequences
    if (state.escaped) {
        state.escaped = false;
        return false; // Escaped chars are not active
    }

    if (char === '\\') {
        state.escaped = true;
        return false;
    }

    // Track quote state
    if (char === "'" && !state.inDoubleQuote) {
        state.inSingleQuote = !state.inSingleQuote;
        return false; // Quote itself is not active
    }

    if (char === '"' && !state.inSingleQuote) {
        state.inDoubleQuote = !state.inDoubleQuote;
        return false; // Quote itself is not active
    }

    // Character is active if not inside any quotes
    return !state.inSingleQuote && !state.inDoubleQuote;
}

/**
 * Check if a command contains shell metacharacters outside of quotes.
 * Parses the command character-by-character to handle quotes and escapes properly.
 * 
 * Examples:
 *   hasShellMetaChars('grep "pattern {"')  → false (quoted)
 *   hasShellMetaChars('echo {a,b,c}')      → true  (unquoted brace expansion)
 *   hasShellMetaChars('cat file > out')    → true  (unquoted redirect)
 *   hasShellMetaChars('echo \\{')           → false (escaped)
 */
function hasShellMetaChars(command: string): boolean {
    const state: ParseState = {
        inSingleQuote: false,
        inDoubleQuote: false,
        escaped: false,
    };

    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        const isActive = advanceParser(char, state);

        // Check for dangerous chars only when active (not quoted/escaped)
        if (isActive && isDangerousChar(char)) {
            return true;
        }
    }

    return false;
}

/**
 * Split a command by shell operators (|, ;, &) while respecting quotes.
 * This ensures quoted strings containing these characters are not split.
 * 
 * Examples:
 *   splitShellCommand('ls | grep test')                    → ['ls', 'grep test']
 *   splitShellCommand('grep "pattern|with|pipes" | wc')   → ['grep "pattern|with|pipes"', 'wc']
 *   splitShellCommand('echo "a;b" ; ls')                  → ['echo "a;b"', 'ls']
 */
function splitShellCommand(command: string): string[] {
    const parts: string[] = [];
    let currentPart = '';
    
    const state: ParseState = {
        inSingleQuote: false,
        inDoubleQuote: false,
        escaped: false,
    };

    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        const isActive = advanceParser(char, state);
        
        // Check if this is a shell operator when active (not quoted)
        if (isActive && /[|;&]/.test(char)) {
            // Found an unquoted shell operator, split here
            if (currentPart.trim()) {
                parts.push(currentPart.trim());
            }
            currentPart = '';
            
            // Skip consecutive operators
            while (i + 1 < command.length && /[|;&]/.test(command[i + 1])) {
                i++;
            }
        } else {
            currentPart += char;
        }
    }
    
    // Add the final part if not empty
    if (currentPart.trim()) {
        parts.push(currentPart.trim());
    }
    
    return parts;
}

/**
 * Check if a bash command is safe to run without confirmation.
 * A command is safe if all individual commands in the chain are whitelisted.
 * Exported for testing.
 */
export function isSafeBashCommand(command: string): boolean {
    // Strip harmless redirects before checking for dangerous patterns.
    // These redirects don't write to files or execute code - they just discard output.
    const cleanCommand = command
        .replace(/\s*2>\s*\/dev\/null/g, "") // Example: "cat file.txt 2>/dev/null" → "cat file.txt" (discard stderr)
        .replace(/\s*1>\s*\/dev\/null/g, "") // Example: "ls -la 1>/dev/null" → "ls -la" (discard stdout)
        .replace(/\s*&>\s*\/dev\/null/g, "") // Example: "find . -name test &>/dev/null" → "find . -name test" (discard both)
        .replace(/\s*>\s*\/dev\/null/g, "") // Example: "grep pattern file >/dev/null" → "grep pattern file" (shorthand for 1>)
        .replace(/\s*2>&1/g, "") // Example: "git status 2>&1" → "git status" (merge stderr to stdout)
        .replace(/\s*2>>&1/g, ""); // Example: "ls 2>>&1" → "ls" (append stderr to stdout)

    // Check for dangerous shell features with quote-aware parsing
    if (hasShellMetaChars(cleanCommand)) {
        return false;
    }

    // Split by pipes and logical operators using quote-aware splitting
    const parts = splitShellCommand(cleanCommand);

    // Check each part through the policy pipeline
    for (const part of parts) {
        if (!isCommandSafe(part)) {
            return false;
        }
    }

    return true;
}

/**
 * Handle user's choice for a tool call.
 */
function handleChoice(choice: string | undefined, toolName: string, ctx: any) {
    if (choice === "Allow") {
        return undefined;
    } else if (choice === "Skip") {
        return { block: true, reason: `${toolName} skipped by user` };
    } else {
        ctx.abort();
        return { block: true, reason: `${toolName} aborted by user` };
    }
}

// ============================================================================
// Extension Entry Point
// ============================================================================

export default function (pi: ExtensionAPI) {
    const allowed = new Set(["read"]);

    pi.on("tool_call", async (event, ctx) => {
        if (allowed.has(event.toolName)) return undefined;

        if (!ctx.hasUI) {
            return { block: true, reason: `${event.toolName} blocked (no UI for confirmation)` };
        }

        const input = event.input as Record<string, any>;

        // Special handling for bash - allow safe commands automatically
        if (event.toolName === "bash") {
            const command = input.command as string | undefined;

            if (command && isSafeBashCommand(command)) {
                // Allow safe commands without confirmation
                return undefined;
            }

            // Ask for confirmation for potentially unsafe commands
            const keys = Object.keys(input);
            const displayMessage =
                keys.length === 1 && command !== undefined
                    ? `$ ${command}`
                    : `bash\n\n${JSON.stringify(input, null, 2)}`;

            const choice = await ctx.ui.select(displayMessage, ["Allow", "Skip", "Abort"]);
            return handleChoice(choice, event.toolName, ctx);
        }

        // Special formatting for edit and write tools - simple confirmation (preview shows everything)
        if (event.toolName === "edit") {
            const choice = await ctx.ui.select("Apply this edit?", ["Allow", "Skip", "Abort"]);
            return handleChoice(choice, event.toolName, ctx);
        }

        if (event.toolName === "write") {
            const choice = await ctx.ui.select("Write this file?", ["Allow", "Skip", "Abort"]);
            return handleChoice(choice, event.toolName, ctx);
        }

        // Default: show full JSON for all other tools
        const inputDisplay = `${event.toolName}\n\n${JSON.stringify(input, null, 2)}`;
        const choice = await ctx.ui.select(inputDisplay, ["Allow", "Skip", "Abort"]);
        return handleChoice(choice, event.toolName, ctx);
    });
}
