---
description: Review code for simplification and de-duplication opportunities
---

Review the code for refactoring opportunities. Look for:

- **Duplicate patterns:** Same logic, calculations, or formatting repeated across functions
- **Missing helpers:** Magic numbers, repeated logic, or common patterns that need extraction
- **Complex structure:** Nested conditionals, branches doing similar things, functions doing too much
- **Clarity issues:** Unclear names, unnecessary comments, overly clever code

Read the code in full, identify specific improvements, and suggest extractions or simplifications.

Discuss trade-offs before implementing. Don't over-abstract—only extract when it genuinely improves clarity. Keep it simple. All tests must still pass.

$ARGUMENTS
