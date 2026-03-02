# AST-Based Permission Gate - Future Enhancement

This document outlines a future enhancement to the permission gate extension using Abstract Syntax Tree (AST) parsing for more accurate bash command safety analysis.

## Current Approach Limitations

The current permission gate uses regex-based parsing with the following limitations:

### 1. Pattern Matching Approach

```typescript
// Current: Simple string/regex checks
const safeBashCommands = new Set(["ls", "cat", "grep", "find"]);
const safeSubcommands = { git: new Set(["log", "show", "diff"]) };

function hasShellMetaChars(command: string): boolean {
  return /[<>`$(){}]/.test(command);  // Basic regex check
}
```

**Limitations:**
- **No semantic understanding** - `rm file` vs `rm < /dev/null` treated the same
- **Crude metacharacter detection** - blocks safe uses like `<(sort file.txt)`
- **Limited quoting support** - complex quote nesting can confuse parser
- **No data flow analysis** - can't distinguish safe vs dangerous pipelines

### 2. Specific Cases That Are Over-Restricted

```bash
# These are SAFE but currently BLOCKED:
comm -12 <(sort file1) <(sort file2)        # Process substitution with safe commands
find . -name "*.txt" -exec head {} \;       # Safe exec with read-only command
xargs -I {} grep pattern {}                  # Safe xargs with safe command

# These should be ALLOWED with better parsing:
jar -tf file.jar | head -20                  # Safe pipeline
docker ps --format "table {{.Names}}"       # Safe docker read-only with complex quotes
```

### 3. Maintenance Burden

Adding new safe patterns requires:
- Manual regex crafting
- Testing edge cases
- Risk of false positives/negatives

## AST-Based Solution

### 1. Tree-sitter Integration

Tree-sitter provides robust, incremental parsing for bash with full language support:

```typescript
import Parser from "tree-sitter";
import Bash from "tree-sitter-bash";

const parser = new Parser();
parser.setLanguage(Bash);

function analyzeCommand(command: string): SafetyResult {
  const tree = parser.parse(command);
  return analyzeNode(tree.rootNode);
}
```

**Benefits:**
- **Complete bash grammar support** - handles all shell constructs correctly
- **Incremental parsing** - fast updates for streaming commands
- **Error recovery** - handles malformed input gracefully
- **Battle-tested** - used by GitHub, VSCode, and many editors

### 2. Semantic Safety Analysis

```typescript
interface SafetyAnalyzer {
  checkCommand(node: SyntaxNode): SafetyResult;
  checkProcessSubstitution(node: SyntaxNode): SafetyResult; 
  checkRedirection(node: SyntaxNode): SafetyResult;
  checkPipeline(node: SyntaxNode): SafetyResult;
}

function analyzeNode(node: SyntaxNode): SafetyResult {
  switch (node.type) {
    case "program":
      return analyzeChildren(node);
      
    case "pipeline":
      // Analyze: cmd1 | cmd2 | cmd3
      return analyzePipeline(node);
      
    case "command":
      // Check: command + args + flags
      return analyzeCommand(node);
      
    case "process_substitution":
      // Handle: <(command) and >(command)
      return analyzeProcessSubstitution(node);
      
    case "command_substitution":  
      // Handle: $(command) and `command`
      return analyzeCommandSubstitution(node);
      
    case "file_redirect":
      // Handle: > file, < file, >> file  
      return analyzeRedirection(node);
      
    // Block dangerous constructs
    case "function_definition":
    case "for_statement":
    case "while_statement":
    case "if_statement":
      return { safe: false, reason: `Control flow (${node.type}) requires confirmation` };
      
    default:
      return analyzeChildren(node);
  }
}
```

### 3. Advanced Safety Rules

#### Process Substitution Support
```typescript
function analyzeProcessSubstitution(node: SyntaxNode): SafetyResult {
  const direction = node.children[0].text; // '<' or '>'
  
  if (direction === '>') {
    // Output process substitution writes data - potentially dangerous
    return { safe: false, reason: 'Output process substitution can write data' };
  }
  
  // Input process substitution <(command) - check inner command safety
  const innerCommand = findChildOfType(node, 'command');
  if (innerCommand) {
    const innerResult = analyzeCommand(innerCommand);
    return innerResult.safe 
      ? { safe: true }
      : { safe: false, reason: `Unsafe command in process substitution: ${innerResult.reason}` };
  }
  
  return { safe: false, reason: 'Could not analyze process substitution content' };
}
```

#### Command Flag Analysis  
```typescript
function analyzeCommand(node: SyntaxNode): SafetyResult {
  const commandName = getCommandName(node);
  const flags = getFlags(node);
  const args = getArguments(node);
  
  // Check base command safety
  if (!isBaseCommandSafe(commandName)) {
    return { safe: false, reason: `Command '${commandName}' not whitelisted` };
  }
  
  // Advanced flag analysis
  if (commandName === "find") {
    // find is safe UNLESS it has -exec, -execdir, -delete
    const dangerousFlags = flags.filter(f => /^-(exec|execdir|delete)/.test(f));
    if (dangerousFlags.length > 0) {
      // Check if -exec commands are safe
      if (dangerousFlags.some(f => f.startsWith("-exec"))) {
        const execCommand = extractExecCommand(node);
        return analyzeCommand(execCommand);  // Recursive analysis
      }
      return { safe: false, reason: `find with dangerous flags: ${dangerousFlags.join(", ")}` };
    }
  }
  
  if (commandName === "docker") {
    // docker read-only: ps, images, inspect, logs, version, info
    const subcommand = args[0];
    const readOnlySubcommands = ["ps", "images", "inspect", "logs", "version", "info"];
    return readOnlySubcommands.includes(subcommand)
      ? { safe: true }
      : { safe: false, reason: `docker subcommand '${subcommand}' not read-only` };
  }
  
  return { safe: true };
}
```

#### Pipeline Data Flow Analysis
```typescript
function analyzePipeline(node: SyntaxNode): SafetyResult {
  const commands = extractPipelineCommands(node);
  
  for (let i = 0; i < commands.length; i++) {
    const cmdResult = analyzeCommand(commands[i]);
    if (!cmdResult.safe) {
      return { 
        safe: false, 
        reason: `Pipeline stage ${i + 1} unsafe: ${cmdResult.reason}` 
      };
    }
    
    // Additional pipeline-specific rules
    const cmdName = getCommandName(commands[i]);
    
    // Last command in pipeline can be more permissive (output goes to terminal)  
    const isLastInPipeline = (i === commands.length - 1);
    
    // First command in pipeline must be safe for reading data
    const isFirstInPipeline = (i === 0);
    
    if (isFirstInPipeline && isDataGenerationCommand(cmdName)) {
      // Commands like 'find', 'grep', 'ls' are safe as pipeline sources
      continue;
    }
    
    if (isLastInPipeline && isDataConsumptionCommand(cmdName)) {
      // Commands like 'head', 'tail', 'wc', 'sort' are safe as pipeline sinks
      continue;
    }
  }
  
  return { safe: true };
}
```

## Implementation Strategy

### 1. Hybrid Approach

Keep both implementations and choose based on complexity:

```typescript
export function isSafeBashCommand(command: string): boolean {
  // Quick check for simple cases
  if (isSimpleCommand(command)) {
    return isSafeBashCommandRegex(command);  // Fast path
  }
  
  // Complex cases use AST  
  try {
    return isSafeBashCommandAST(command);
  } catch (error) {
    // Fallback to regex on parse errors
    console.warn('AST parsing failed, falling back to regex:', error);
    return isSafeBashCommandRegex(command);
  }
}

function isSimpleCommand(command: string): boolean {
  // No pipes, redirects, substitutions, or quotes
  return !/[|&;<>$`"'()]/.test(command) && 
         !command.includes('\\') &&
         command.split(/\s+/).length <= 10;  // Reasonable arg count
}
```

### 2. Gradual Migration

**Phase 1**: AST for specific constructs
```typescript
// Enable AST only for process substitution
if (command.includes('<(') || command.includes('>(')) {
  return isSafeBashCommandAST(command);
}
return isSafeBashCommandRegex(command);
```

**Phase 2**: AST as primary, regex as fallback
```typescript
try {
  return isSafeBashCommandAST(command);
} catch {
  return isSafeBashCommandRegex(command);
}
```

**Phase 3**: AST only (regex deprecated)

### 3. Package Extension Structure

```
~/.pi/agent/extensions/
└── permission-gate-ast/
    ├── package.json
    ├── package-lock.json
    ├── node_modules/
    │   ├── tree-sitter/
    │   └── tree-sitter-bash/
    └── src/
        ├── index.ts              # Extension entry point
        ├── ast-analyzer.ts       # AST-based analysis
        ├── safety-rules.ts       # Command safety rules  
        ├── regex-fallback.ts     # Current regex implementation
        └── test/
            └── analyzer.test.ts  # Test cases
```

```json
{
  "name": "permission-gate-ast",
  "version": "1.0.0", 
  "description": "AST-based permission gate using tree-sitter",
  "dependencies": {
    "tree-sitter": "^0.21.0",
    "tree-sitter-bash": "^0.23.1"
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

### 4. Extension Implementation

```typescript
// src/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { ASTSafetyAnalyzer } from "./ast-analyzer.js";
import { isSafeBashCommandRegex } from "./regex-fallback.js";

export default function (pi: ExtensionAPI) {
  let analyzer: ASTSafetyAnalyzer | null = null;
  
  try {
    analyzer = new ASTSafetyAnalyzer();
  } catch (err) {
    console.warn("Tree-sitter not available, using regex fallback:", err);
  }
  
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;
    
    const command = event.input.command as string;
    if (!command) return undefined;
    
    let isSafe = false;
    
    if (analyzer) {
      try {
        const result = analyzer.analyze(command);
        isSafe = result.safe;
        
        if (!isSafe && result.reason) {
          console.log(`AST analysis blocked: ${result.reason}`);
        }
      } catch (err) {
        console.warn("AST analysis failed, falling back to regex:", err);
        isSafe = isSafeBashCommandRegex(command);
      }
    } else {
      isSafe = isSafeBashCommandRegex(command);
    }
    
    if (isSafe) return undefined; // Allow
    
    // Require confirmation for unsafe commands
    if (!ctx.hasUI) {
      return { block: true, reason: "Unsafe bash command (no UI for confirmation)" };
    }
    
    const choice = await ctx.ui.select(`$ ${command}`, ["Allow", "Skip", "Abort"]);
    if (choice === "Allow") return undefined;
    if (choice === "Skip") return { block: true, reason: "Skipped by user" };
    
    ctx.abort();
    return { block: true, reason: "Aborted by user" };
  });
}
```

```typescript
// src/ast-analyzer.ts  
import Parser from "tree-sitter";
import Bash from "tree-sitter-bash";
import { SafetyRules } from "./safety-rules.js";

export interface SafetyResult {
  safe: boolean;
  reason?: string;
}

export class ASTSafetyAnalyzer {
  private parser: Parser;
  private rules: SafetyRules;
  
  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(Bash);
    this.rules = new SafetyRules();
  }
  
  analyze(command: string): SafetyResult {
    try {
      const tree = this.parser.parse(command);
      return this.analyzeNode(tree.rootNode);
    } catch (err) {
      return { 
        safe: false, 
        reason: `Parse error: ${err instanceof Error ? err.message : String(err)}` 
      };
    }
  }
  
  private analyzeNode(node: any): SafetyResult {
    switch (node.type) {
      case "program":
        return this.analyzeChildren(node);
      case "pipeline": 
        return this.analyzePipeline(node);
      case "command":
        return this.analyzeCommand(node);
      case "process_substitution":
        return this.analyzeProcessSubstitution(node);
      // ... other cases
      default:
        return this.analyzeChildren(node);
    }
  }
  
  // Implementation methods...
}
```

## Benefits of AST Approach

### 1. Accuracy Improvements

| Command | Current (Regex) | AST-based | Improvement |
|---------|----------------|-----------|-------------|
| `comm -12 <(sort f1) <(sort f2)` | ❌ Blocked | ✅ Allowed | Process substitution support |
| `find . -name "*.txt" -exec cat {} \;` | ❌ Blocked | ✅ Allowed | Safe -exec analysis |  
| `docker ps --format "{{.Names}}"` | ❌ Blocked | ✅ Allowed | Complex quote handling |
| `echo 'rm file' > log.txt` | ❌ Blocked | ✅ Allowed | Quoted command detection |
| `$(rm -rf /)` | ❌ Blocked | ❌ Blocked | Still properly blocked |

### 2. Extensibility

```typescript
// Easy to add new command patterns
rules.addCommand("kubectl", {
  safeSubcommands: ["get", "describe", "logs", "version"],
  flagAnalysis: (flags) => !flags.some(f => f.startsWith("delete"))
});

// Complex conditional rules  
rules.addRule("find", (node) => {
  const execFlag = findFlag(node, "-exec");
  if (execFlag) {
    const execCommand = parseExecCommand(execFlag);
    return analyzeCommand(execCommand); // Recursive
  }
  return { safe: true };
});
```

### 3. Better User Experience

```bash
# Current: User sees generic "dangerous command" 
$ comm -12 <(sort file1) <(sort file2) 
❌ bash blocked (no UI for confirmation)

# AST-based: More specific messaging
$ comm -12 <(sort file1) <(sort file2)
✅ Allowed (process substitution with safe commands: sort, comm)

$ find . -exec rm {} \;
❌ Blocked: find -exec with unsafe command 'rm'
   Suggestion: Use find ... -print0 | xargs -0 ls -la for inspection
```

## Testing Strategy

### 1. Comprehensive Test Suite

```typescript
describe("ASTSafetyAnalyzer", () => {
  const analyzer = new ASTSafetyAnalyzer();
  
  describe("process substitution", () => {
    it("allows safe process substitution", () => {
      expect(analyzer.analyze("comm -12 <(sort f1) <(sort f2)")).toEqual({
        safe: true
      });
    });
    
    it("blocks dangerous process substitution", () => {
      expect(analyzer.analyze("comm -12 <(rm file) <(sort f2)")).toEqual({
        safe: false,
        reason: "Unsafe command in process substitution: rm"
      });
    });
  });
  
  describe("complex quoting", () => {
    it("handles nested quotes correctly", () => {
      expect(analyzer.analyze(`echo 'He said "rm file"' > log.txt`)).toEqual({
        safe: true  // rm is quoted, echo and redirect are safe
      });
    });
  });
});
```

### 2. Migration Testing

```typescript
describe("Migration compatibility", () => {
  it("AST results should be superset of regex (no false negatives)", () => {
    const testCommands = [
      "ls -la",
      "grep pattern file", 
      "git log --oneline",
      // ... comprehensive test suite
    ];
    
    for (const cmd of testCommands) {
      const regexResult = isSafeBashCommandRegex(cmd);
      const astResult = analyzer.analyze(cmd).safe;
      
      if (regexResult && !astResult) {
        throw new Error(`AST more restrictive than regex for: ${cmd}`);
      }
    }
  });
});
```

## Migration Timeline

### Phase 1: Proof of Concept (1-2 weeks)
- [ ] Create package extension with tree-sitter dependencies
- [ ] Implement basic AST parsing for simple commands
- [ ] Add process substitution support  
- [ ] Test with current permission-gate test cases

### Phase 2: Feature Parity (2-3 weeks)  
- [ ] Implement all current regex rules in AST form
- [ ] Add advanced features (exec analysis, complex quoting)
- [ ] Comprehensive test suite
- [ ] Performance benchmarking

### Phase 3: Enhanced Rules (2-3 weeks)
- [ ] Add command-specific flag analysis  
- [ ] Pipeline data flow rules
- [ ] Better error messages and suggestions
- [ ] Documentation and examples

### Phase 4: Production Ready (1 week)
- [ ] Hybrid implementation (AST + regex fallback)
- [ ] Error handling and graceful degradation
- [ ] User migration guide
- [ ] Performance optimization

## Future Enhancements

### 1. Machine Learning Integration
```typescript
// Learn from user approval patterns
class MLSafetyAnalyzer {
  async analyze(command: string): Promise<SafetyResult & { confidence: number }> {
    const astResult = this.astAnalyzer.analyze(command);
    const mlResult = await this.mlModel.predict(command);
    
    return {
      safe: astResult.safe && mlResult.safe,
      confidence: Math.min(astResult.confidence, mlResult.confidence),
      reason: astResult.reason || mlResult.reason
    };
  }
}
```

### 2. Context-Aware Analysis  
```typescript
// Consider file system context
if (isInSafeDirectory(cwd) && isReadOnlyCommand(command)) {
  return { safe: true, reason: "Read-only command in safe directory" };
}

// Consider previous commands in session
if (wasRecentlyInspected(targetFile) && isModifyCommand(command, targetFile)) {
  return { safe: true, reason: "Modifying recently inspected file" };  
}
```

### 3. Interactive Command Building
```typescript
// Suggest safe alternatives
return {
  safe: false,
  reason: "rm command is dangerous", 
  suggestions: [
    "Use 'ls -la' to inspect files first",
    "Use 'mv file /tmp/' to move instead of delete",
    "Use 'find . -name pattern -print' to preview matches"
  ]
};
```

This AST-based approach would significantly enhance the permission gate's accuracy while maintaining the security benefits of the current system.