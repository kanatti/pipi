/**
 * Permission Gate
 *
 * Allows `read` freely. Everything else (bash, write, edit, etc.)
 * requires user confirmation before executing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
    const allowed = new Set(["read"]);
    
    // Safe read-only commands that can run without confirmation
    const safeBashCommands = new Set([
        "ls", "cat", "grep", "find", "pwd", "echo", "which",
        "head", "tail", "less", "more", "wc", "file", "stat", "printenv"
    ]);
    
    /**
     * Check if a bash command is safe to run without confirmation.
     * A command is safe if all individual commands in the chain are whitelisted.
     */
    function isSafeBashCommand(command: string): boolean {
        // Split by common shell operators: |, ||, &&, ;
        // Also handle redirects >, >>, < but these make it unsafe
        if (/[<>`$(){}]/.test(command)) {
            return false; // Redirects, subshells, and command substitution are unsafe
        }
        
        // Split by pipes and logical operators
        const parts = command.split(/[|;&]+/).map(s => s.trim());
        
        // Check each part - extract the first word (the command)
        for (const part of parts) {
            const firstWord = part.split(/\s+/)[0];
            if (!firstWord || !safeBashCommands.has(firstWord)) {
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
            const displayMessage = keys.length === 1 && command !== undefined
                ? `$ ${command}`
                : `bash\n\n${JSON.stringify(input, null, 2)}`;
            
            const choice = await ctx.ui.select(displayMessage, ["Allow", "Skip", "Abort"]);
            return handleChoice(choice, event.toolName, ctx);
        }

        // Special formatting for edit tool - simple confirmation (preview shows everything)
        if (event.toolName === "edit") {
            const choice = await ctx.ui.select("Apply this edit?", ["Allow", "Skip", "Abort"]);
            return handleChoice(choice, event.toolName, ctx);
        }

        // Default: show full JSON for all other tools
        const inputDisplay = `${event.toolName}\n\n${JSON.stringify(input, null, 2)}`;
        const choice = await ctx.ui.select(inputDisplay, ["Allow", "Skip", "Abort"]);
        return handleChoice(choice, event.toolName, ctx);
    });
}
