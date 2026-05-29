# update_firebase_workflow.ps1
# Revised PowerShell script that safely updates (or creates) the Firebase Hosting GitHub Actions workflow.
# It avoids PowerShell parsing errors by using a placeholder for the branch name and escaping the `${{` syntax.

param(
    [Parameter(Mandatory=$true)][string]$RepoUrl = "https://github.com/carteblanchetv/carp-dashboard.git",
    [Parameter(Mandatory=$false)][string]$Branch = "main",
    [Parameter(Mandatory=$false)][string]$TempDir = "$env:TEMP\fb_workflow_update"
)

function Write-Log {
    param([string]$Message)
    Write-Host "[WORKFLOW] $Message"
}

# Ensure Git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH. Install Git first."
    exit 1
}

# Clean any previous temp folder
if (Test-Path $TempDir) { Remove-Item -Recurse -Force $TempDir }
New-Item -ItemType Directory -Path $TempDir | Out-Null
Set-Location $TempDir

Write-Log "Cloning the repository (working copy)"
# Clone the repo (full checkout, not a mirror)
git clone $RepoUrl
if ($LASTEXITCODE -ne 0) {
    Write-Error "Git clone failed. Check the repository URL and your permissions."
    exit 1
}

# Derive the folder name from the URL (e.g., carp-dashboard from the repo URL)
$RepoFolder = ($RepoUrl -replace ".*\/([^\/]+)\.git", "`$1")
Set-Location $RepoFolder

# Verify we are inside a git repo
if (-not (Test-Path .git)) {
    Write-Error "The cloned directory does not contain a .git folder. Something went wrong."
    exit 1
}

# Path to the Firebase Hosting workflow (standard name used by Firebase)
$WorkflowPath = ".github/workflows/firebase-hosting-pull-request.yml"

if (-not (Test-Path $WorkflowPath)) {
    Write-Log "Workflow file not found. Creating a new Firebase Hosting workflow."
    # Ensure the directories exist
    New-Item -ItemType Directory -Force -Path (Split-Path $WorkflowPath) | Out-Null
    # Create a minimal workflow with a placeholder for the branch name
    $NewWorkflow = @'
name: Deploy to Firebase Hosting on PR

on:
  push:
    branches:
      - __BRANCH__
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - __BRANCH__

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
    # Replace the placeholder with the actual branch name (no PowerShell interpolation inside the here‑string)
    $NewWorkflow = $NewWorkflow -replace "__BRANCH__", $Branch
    Set-Content -Path $WorkflowPath -Value $NewWorkflow -Encoding UTF8
    Write-Log "Created workflow at $WorkflowPath"
    # Commit the new workflow
    git config user.name "migration-bot"
    git config user.email "migration-bot@example.com"
    git add $WorkflowPath
    git commit -m "chore: add Firebase Hosting workflow for new repo"
    git push origin $Branch
    Write-Log "Workflow added and pushed to $Branch"
    exit 0
}

Write-Log "Workflow file found. Updating repository reference inside the workflow."
$Content = Get-Content $WorkflowPath -Raw
# Replace any old owner/repo reference with the new one (simple string replace)
$UpdatedContent = $Content -replace "OwlArcana/cb-deliverables", "carteblanchetv/carp-dashboard"
if ($Content -eq $UpdatedContent) {
    Write-Log "No reference to old repository found. No changes required."
} else {
    Set-Content -Path $WorkflowPath -Value $UpdatedContent -Encoding UTF8
    Write-Log "Workflow updated with new repository reference."
    git config user.name "migration-bot"
    git config user.email "migration-bot@example.com"
    git add $WorkflowPath
    git commit -m "chore: update Firebase Hosting workflow to new repo"
    git push origin $Branch
    Write-Log "Changes committed and pushed to $Branch"
}

Write-Log "Cleanup: you may delete $TempDir if desired."
