# Git Workflows

This repository includes two PowerShell scripts for daily Git flow:

- `scripts/gp.ps1` for commit and push
- `scripts/gm.ps1` for merge to `main` and return to `vince`

## Quick Guide (Which One To Use)

- Use `gp.ps1` when you changed files and want to save + upload your branch changes.
- Use `gm.ps1` when your branch is ready to release into `main`.

Cheat sheet:

```powershell
# Commit and push current branch
.\scripts\gp.ps1 -Message "feat: short summary"

# Commit and push a specific branch
.\scripts\gp.ps1 -Message "fix: short summary" -Branch "vince"

# Merge vince -> main, push main, then go back to vince
.\scripts\gm.ps1
```

## 1) Commit and Push Workflow

From repository root:

```powershell
# Use this after editing files on your current branch.
# Required: -Message
.\scripts\gp.ps1 -Message "feat: your change summary"
```

Optional explicit branch:

```powershell
# Use this when you want to force commit/push on a specific branch.
.\scripts\gp.ps1 -Message "fix: your message" -Branch "vince"
```

What it does:

- Moves to repo root
- Uses current branch (or provided `-Branch`)
- Runs `git add -A`
- Creates commit with `-Message`
- Pushes branch to `origin` with upstream

## 2) Merge to Main and Return to Vince

From repository root:

```powershell
# Use this when your source branch is ready to go into main.
# Default source branch is vince.
.\scripts\gm.ps1
```

Defaults:

- Source branch: `vince`
- Main branch: `main`
- Merge message: `merge: bring vince changes into main`

Optional custom values:

```powershell
# Use this when source/main branch names are different,
# or when you want a custom merge message.
.\scripts\gm.ps1 `
  -SourceBranch "vince" `
  -MainBranch "main" `
  -MergeMessage "merge: release from vince to main" `
  -NoFF
```

What it does:

- Fetches latest remote refs
- Validates source branch has no uncommitted changes
- Checks out `main` and pulls latest with fast-forward only
- Merges source branch into `main` (use `-NoFF` for explicit merge commit)
- Pushes `main`
- Checks out source branch again
