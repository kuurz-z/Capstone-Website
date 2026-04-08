param(
  [Parameter(Mandatory=$true)]
  [string]$Message,

  [string]$Branch
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path ".git")) {
  throw "No Git repository found at $repoRoot"
}

$currentBranch = git branch --show-current
if (-not $currentBranch) {
  throw "Unable to determine current branch."
}

$targetBranch = if ($Branch) { $Branch } else { $currentBranch }
if ($targetBranch -ne $currentBranch) {
  git checkout $targetBranch
}

$pending = git status --porcelain
if (-not $pending) {
  Write-Host "No changes to commit on branch '$targetBranch'."
  exit 0
}

git add -A
git commit -m "$Message"
git push -u origin $targetBranch

Write-Host "Done: committed and pushed '$targetBranch'."
