# push_firebase_workflow.ps1
# This script adds the Firebase Hosting workflow file to the cloned repository and pushes it using the provided PAT.

param(
    [Parameter(Mandatory=$true)][string]$RepoPath = "C:\Users\lizzy\.gemini\antigravity\scratch\cb_forms\repo_workflow\carp-dashboard",
    [Parameter(Mandatory=$true)][string]$Pat = "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",
    [Parameter(Mandatory=$false)][string]$Branch = "main"
)

function Write-Log {
    param([string]$Message)
    Write-Host "[PUSH] $Message"
}

# Ensure we are inside the repo
if (-not (Test-Path $RepoPath)) {
    Write-Error "Repo path does not exist: $RepoPath"
    exit 1
}
Set-Location $RepoPath

# Verify that this is a git repo
if (-not (Test-Path .git)) {
    Write-Error "Directory is not a git repository."
    exit 1
}

# Set remote URL with PAT for authentication (replace existing origin)
$remoteUrl = "https://$Pat@github.com/carteblanchetv/carp-dashboard.git"
git remote set-url origin $remoteUrl
Write-Log "Remote URL set to PAT-authenticated URL."

# Create workflow directory if missing
New-Item -ItemType Directory -Force -Path ".github/workflows" | Out-Null

# Workflow content (uses a heredoc to avoid PowerShell parsing issues)
$workflow = @'
name: Deploy to Firebase Hosting on PR

on:
  push:
    branches:
      - main
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy to Firebase
        uses: w9jds/firebase-action@v2
        with:
          args: deploy --only hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
'@

$workflowPath = ".github/workflows/firebase-hosting-pull-request.yml"
Set-Content -Path $workflowPath -Value $workflow -Encoding UTF8
Write-Log "Workflow file written to $workflowPath"

# Git add / commit
git config user.name "migration-bot"
git config user.email "migration-bot@example.com"

git add $workflowPath

git commit -m "chore: add Firebase Hosting workflow"
Write-Log "Commit created."

# Push to the remote
git push origin $Branch
Write-Log "Push attempted."
