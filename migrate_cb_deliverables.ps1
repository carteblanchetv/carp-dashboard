# migrate_cb_deliverables.ps1
# PowerShell script to migrate the cb-deliverables project from the current GitHub owner (OwlArcana) to a new owner (carteblanchetv).

param(
    [Parameter(Mandatory=$true)][string]$OldRepo = "https://github.com/OwlArcana/cb-deliverables.git",
    [Parameter(Mandatory=$true)][string]$NewRepo = "https://github.com/carteblanchetv/carp-dashboard.git",
    [Parameter(Mandatory=$false)][string]$TempDir = "$env:TEMP\cb_deliverables_migrate"
)

function Write-Log {
    param([string]$Message)
    Write-Host "[MIGRATE] $Message"
}

# Ensure Git is available
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "Git is not installed or not in PATH. Install Git first."
    exit 1
}

# Clean up any previous temp folder
if (Test-Path $TempDir) {
    Write-Log "Removing previous temporary folder: $TempDir"
    Remove-Item -Recurse -Force $TempDir
}

New-Item -ItemType Directory -Path $TempDir | Out-Null
Set-Location $TempDir

Write-Log "Cloning the source repository as a mirror (full history)"
git clone --mirror $OldRepo

# The cloned folder ends with .git
$RepoName = [System.IO.Path]::GetFileNameWithoutExtension($OldRepo)
$MirrorPath = "${RepoName}.git"

if (-not (Test-Path $MirrorPath)) {
    Write-Error "Mirror clone failed. Expected $MirrorPath to exist."
    exit 1
}

Set-Location $MirrorPath

Write-Log "Adding new remote and pushing the full mirror to the new repository"
# Set the push URL to the new repository (overwrites any existing push URL)
git remote set-url --push origin $NewRepo

git push --mirror

Write-Log "Migration complete. Verify the new repo on GitHub."

# Optional: suggest next steps for Firebase linking
Write-Host "\n=== Next Steps ==="
Write-Host "1. In the Firebase console, add the new GitHub account as a collaborator (Project Settings → Users & permissions)."
Write-Host "2. Re‑connect Hosting to the new repository (Firebase → Hosting → Connect repo)."
Write-Host "3. Verify the GitHub Actions workflow points to the new repo (see firebase-hosting-pull-request.yml)."
Write-Host "4. Delete the temporary folder if desired: Remove-Item -Recurse -Force $TempDir"
