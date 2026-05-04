---
description: Stage and commit changes with a descriptive message
---

# Commit Changes

Stages all changes and creates a commit with a conventional commit message.

## How to Run

**Option 1 — Ask the AI:** Type `/commit` in chat (AI will generate the message for you)

**Option 2 — Run manually:**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website

git add .
git commit -m "feat: your description here"
```

## Commit Prefixes
| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature or enhancement |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring (no behavior change) |
| `chore:` | Maintenance, dependency updates |
| `docs:` | Documentation changes |
| `style:` | CSS/styling changes |

## AI Steps

// turbo-all

1. Check what files have changed:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git status
```

2. Stage all changes:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git add .
```

3. Ask the user for a commit message. If none provided, generate a descriptive one based on the changed files using conventional commit prefixes from the table above.

4. Commit with the message:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git commit -m "<commit message>"
```

5. Show the user the commit hash and summary of what was committed.
