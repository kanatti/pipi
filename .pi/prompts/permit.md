---
description: Add a safe command to permission-gate extension
---
Add the following to the permission-gate extension at `./extensions/permission-gate.ts`:

$@

Analyze the command and determine:
1. Is it a simple read-only command (like `ls`, `cat`, `grep`)? → Add to `safeBashCommands` set
2. Does it have safe subcommands (like `git log`, `docker ps`)? → Add to `safeSubcommands` with allowed subcommands
3. Does it need special handling (like `gh` or `ktools`)? → Create a new policy checker function

After making changes:
- Explain what you added and why it's safe
- Show the relevant code section
- Suggest test cases to verify the change
