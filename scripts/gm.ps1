param(
  [string]$SourceBranch = "vince",
  [string]$MainBranch = "main",
  [string]$MergeMessage,
  [switch]$NoFF
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Test-Path ".git")) {
  throw "No Git repository found at $repoRoot"
}

$startBranch = git branch --show-current
if (-not $startBranch) {
  throw "Unable to determine current branch."
}

if (-not $MergeMessage) {
  $MergeMessage = "merge: bring $SourceBranch changes into $MainBranch"
}

git fetch origin

git checkout $SourceBranch
$statusSource = git status --porcelain
if ($statusSource) {
  throw "Source branch '$SourceBranch' has uncommitted changes. Commit/stash first."
}

git checkout $MainBranch
git pull --ff-only origin $MainBranch

if ($NoFF) {
  git merge --no-ff $SourceBranch -m "$MergeMessage"
} else {
  git merge $SourceBranch -m "$MergeMessage"
}

git push origin $MainBranch
git checkout $SourceBranch

Write-Host "Done: merged '$SourceBranch' into '$MainBranch', pushed, and returned to '$SourceBranch'."
