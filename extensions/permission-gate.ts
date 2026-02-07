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

// Pipeline of policy checks - add more policies here as needed
const policyChecks: PolicyChecker[] = [
    checkSimpleSafeCommand,
    checkSafeSubcommand,
    checkSafeGhCommand,
    checkSafeKtoolsCommand,
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

    // Now check for dangerous shell features AFTER stripping safe redirects
    // This prevents false positives from the ">" in "2>/dev/null"
    if (/[<>`$(){}]/.test(cleanCommand)) {
        return false; // Redirects, subshells, and command substitution are unsafe
    }

    // Split by pipes and logical operators
    const parts = cleanCommand.split(/[|;&]+/).map((s) => s.trim());

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
