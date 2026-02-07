/**
 * Checkpoints
 *
 * Save and continue checkpoints with AI-generated continuation prompts.
 *
 * Commands:
 *   /checkpoints save <name>       - Pick a prompt template, generate continuation
 *   /checkpoints continue [name]   - Load a saved checkpoint (shows picker if no name)
 *   /checkpoints list              - List all saved checkpoints
 *   /checkpoints delete <name>     - Delete a saved checkpoint
 *   /checkpoints help              - Show help (also shown when no args provided)
 */

import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, SessionEntry } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, matchesKey, Text } from "@mariozechner/pi-tui";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Storage paths
const PIPI_DIR = join(homedir(), ".pipi");

// Checkpoints: AI-generated continuation prompts that can be loaded with /checkpoints continue
const CHECKPOINTS_DIR = join(PIPI_DIR, "checkpoints");

// Prompts: User-defined templates for generating continuation prompts
// Used by /checkpoints save when no custom instructions are provided
const PROMPTS_DIR = join(PIPI_DIR, "prompts");

// Ensure directories exist
mkdirSync(CHECKPOINTS_DIR, { recursive: true });
mkdirSync(PROMPTS_DIR, { recursive: true });

/**
 * Display markdown content in a bordered dialog.
 * User can press Enter or Escape to close.
 */
async function showMarkdownDialog(title: string, content: string, ctx: ExtensionCommandContext) {
    await ctx.ui.custom((_tui, theme, _kb, done) => {
        const container = new Container();
        const border = new DynamicBorder((s: string) => theme.fg("accent", s));
        const mdTheme = getMarkdownTheme();

        container.addChild(border);
        container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
        container.addChild(new Markdown(content, 1, 1, mdTheme));
        container.addChild(new Text(theme.fg("dim", "Press Enter or Esc to close"), 1, 0));
        container.addChild(border);

        return {
            render: (width: number) => container.render(width),
            invalidate: () => container.invalidate(),
            handleInput: (data: string) => {
                if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
                    done(undefined);
                }
            },
        };
    });
}

/**
 * Get available prompt template names from ~/.pipi/prompts/
 * Scans for .md files and returns their names without extension.
 * Example: ["default", "learning", "debugging"]
 */
function getPromptFiles(): string[] {
    if (!existsSync(PROMPTS_DIR)) {
        return [];
    }
    return readdirSync(PROMPTS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Load a prompt template by name.
 * Reads ~/.pipi/prompts/<name>.md and returns its content.
 * Throws if the file doesn't exist.
 */
function loadPrompt(name: string): string {
    const path = join(PROMPTS_DIR, `${name}.md`);
    if (!existsSync(path)) {
        throw new Error(`Prompt not found: ${name}`);
    }
    return readFileSync(path, "utf-8");
}

/**
 * Get list of saved checkpoint names from ~/.pipi/checkpoints/
 * Scans for .md files and returns their names without extension.
 * Used by /checkpoints continue to show picker when no name is provided.
 */
function getSavedCheckpoints(): string[] {
    if (!existsSync(CHECKPOINTS_DIR)) {
        return [];
    }
    return readdirSync(CHECKPOINTS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(/\.md$/, ""));
}

async function saveHandler(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI) {
    const name = args.trim();
    if (!name) {
        ctx.ui.notify("Usage: /save <name>", "error");
        return;
    }

    // Get prompt template via picker
    const prompts = getPromptFiles();
    if (prompts.length === 0) {
        ctx.ui.notify("No prompts found. Add prompts to ~/.pipi/prompts/", "error");
        return;
    }
    const selected = await ctx.ui.select("Choose prompt:", prompts);
    if (!selected) return;
    const promptTemplate = loadPrompt(selected);

    // Get messages from current session (filter to standard message types only)
    const entries = ctx.sessionManager.getBranch();
    const messages = entries
        .filter((e): e is Extract<SessionEntry, { type: "message" }> => e.type === "message")
        .map((e) => e.message)
        .filter(
            (m): m is Extract<typeof m, { role: "user" | "assistant" | "toolResult" }> =>
                m.role === "user" || m.role === "assistant" || m.role === "toolResult",
        );

    if (messages.length === 0) {
        ctx.ui.notify("No conversation to save", "warning");
        return;
    }

    // Check if checkpoint file already exists, confirm overwrite
    const promptPath = join(CHECKPOINTS_DIR, `${name}.md`);
    if (existsSync(promptPath)) {
        const ok = await ctx.ui.confirm("Overwrite?", `${name}.md already exists`);
        if (!ok) return;
    }

    // Generate continuation
    ctx.ui.notify("Generating continuation prompt...", "info");

    const model = ctx.model;
    if (!model) {
        ctx.ui.notify("No model selected", "error");
        return;
    }

    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
        ctx.ui.notify("No API key available for current model", "error");
        return;
    }

    try {
        // Append the prompt template as the final user message
        const messagesWithPrompt = [
            ...messages,
            {
                role: "user" as const,
                content: [{ type: "text" as const, text: promptTemplate }],
                timestamp: Date.now(),
            },
        ];

        const response = await complete(model, { messages: messagesWithPrompt }, { apiKey });

        const content = response.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("\n");

        writeFileSync(promptPath, content, "utf-8");

        // Display the generated continuation
        await showMarkdownDialog(`Saved: ${name}.md`, content, ctx);
    } catch (error) {
        ctx.ui.notify(`Failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
}

async function showHelp(ctx: ExtensionCommandContext) {
    const helpText = `# Checkpoints

Manage checkpoint continuations with AI-generated prompts.

## Commands

- \`/checkpoints save <name>\` — Pick a prompt template, generate continuation from current session
- \`/checkpoints continue [name]\` — Load a saved checkpoint (shows picker if no name)
- \`/checkpoints list\` — List all saved checkpoints
- \`/checkpoints delete <name>\` — Delete a saved checkpoint
- \`/checkpoints help\` — Show this help

## Storage

- Checkpoints: \`~/.pipi/checkpoints/\`
- Prompts: \`~/.pipi/prompts/\`

## Example Prompts

Copy example prompts to get started:

\`\`\`bash
mkdir -p ~/.pipi/prompts
cp examples/prompts/*.md ~/.pipi/prompts/
\`\`\`
`;
    await showMarkdownDialog("Checkpoints Help", helpText, ctx);
}

async function deleteHandler(args: string, ctx: ExtensionCommandContext) {
    const name = args.trim();
    if (!name) {
        ctx.ui.notify("Usage: /checkpoints delete <name>", "error");
        return;
    }

    const filePath = join(CHECKPOINTS_DIR, `${name}.md`);
    if (!existsSync(filePath)) {
        ctx.ui.notify(`Checkpoint not found: ${name}.md`, "error");
        return;
    }

    const ok = await ctx.ui.confirm("Confirm Delete", `Delete ${name}.md?`);
    if (!ok) return;

    unlinkSync(filePath);
    ctx.ui.notify(`Deleted ${name}.md`, "info");
}

async function continueHandler(args: string, ctx: ExtensionCommandContext) {
    let name = args.trim();

    // Show picker if no name
    if (!name) {
        const checkpoints = getSavedCheckpoints();
        if (checkpoints.length === 0) {
            ctx.ui.notify("No saved checkpoints found", "warning");
            return;
        }
        const selected = await ctx.ui.select("Choose checkpoint:", checkpoints);
        if (!selected) return;
        name = selected;
    }

    const filePath = join(CHECKPOINTS_DIR, `${name}.md`);
    if (!existsSync(filePath)) {
        ctx.ui.notify(`Checkpoint not found: ${name}.md`, "error");
        return;
    }

    const content = readFileSync(filePath, "utf-8");
    ctx.ui.setEditorText(content);
    ctx.ui.notify(`Loaded ${name}.md`, "info");
}

export default function (pi: ExtensionAPI) {
    pi.registerCommand("checkpoints", {
        description: "Manage checkpoint continuations (save, continue, delete)",
        handler: async (args, ctx) => {
            const parts = args.trim().split(/\s+/);
            const action = parts[0];
            const rest = parts.slice(1).join(" ");

            if (action === "save") {
                await saveHandler(rest, ctx, pi);
            } else if (action === "continue") {
                await continueHandler(rest, ctx);
            } else if (action === "list") {
                const checkpoints = getSavedCheckpoints();
                if (checkpoints.length === 0) {
                    ctx.ui.notify("No saved checkpoints found", "info");
                } else {
                    const list = checkpoints.map((s) => `  • ${s}.md`).join("\n");
                    const message = `Saved Checkpoints (${checkpoints.length})\n\n${list}`;

                    pi.sendMessage({
                        customType: "checkpoints-list",
                        content: message,
                        display: true,
                    });
                }
            } else if (action === "delete") {
                await deleteHandler(rest, ctx);
            } else if (action === "help" || !action) {
                await showHelp(ctx);
            } else {
                ctx.ui.notify(`Unknown action: ${action}. Use /checkpoints help for usage.`, "error");
            }
        },
    });
}
