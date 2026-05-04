---
description: Stage, commit, and push changes to the remote repository
---

# Commit & Push Changes

Stages all changes, commits, and pushes to the remote in one go.

## How to Run

**Option 1 — Ask the AI:** Type `/git-push` in chat (AI will handle everything)

**Option 2 — Run manually:**
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website

git add -A
git commit -m "feat: your description here"
git push
```

1. Check the current git status to review changes:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git status
```

2. Stage all changes:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git add -A
```

3. Ask the user for a commit message. If none provided, generate a descriptive one based on the changed files.

4. Commit with the message:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git commit -m "<commit message>"
```

5. Push to the remote:
```bash
cd D:\Portfolio\3rdYear\CapstoneSystem\Capstone-Website && git push
```

6. Confirm the push was successful by checking the terminal output.
