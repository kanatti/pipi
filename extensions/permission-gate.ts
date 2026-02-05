/**
 * Permission Gate
 *
 * Allows `read` freely. Everything else (bash, write, edit, etc.)
 * requires user confirmation before executing.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const allowed = new Set(["read"]);

	pi.on("tool_call", async (event, ctx) => {
		if (allowed.has(event.toolName)) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: `${event.toolName} blocked (no UI for confirmation)` };
		}

		const input = JSON.stringify(event.input, null, 2);
		const ok = await ctx.ui.confirm(event.toolName, `Allow ${event.toolName}?\n\n${input}`);

		if (!ok) {
			ctx.abort();
			return { block: true, reason: `${event.toolName} blocked by user` };
		}

		return undefined;
	});
}
