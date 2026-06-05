# ============================================================
#  deploy.ps1  —  Commit, push to GitHub & deploy to Firebase
#  Usage: .\deploy.ps1 "Your commit message"
# ============================================================

param(
    [string]$Message = "chore: update"
)

$ErrorActionPreference = "Stop"
$GIT = "C:\Program Files\Git\cmd\git.exe"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CB Deliverables — Deploy Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Check git is available ---
if (-not (Test-Path $GIT)) {
    # Fallback: check PATH
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCmd) {
        $GIT = $gitCmd.Source
    } else {
        $GIT = $null
    }
    if (-not $GIT) {
        Write-Host "ERROR: git not found. Please install Git from https://git-scm.com/download/win" -ForegroundColor Red
        exit 1
    }
}

# --- 2. Stage all changes ---
Write-Host "Staging changes..." -ForegroundColor Yellow
& $GIT add -A

# Check if there's anything to commit
$status = & $GIT status --porcelain
if ($null -eq $status -or $status -eq "") {
    Write-Host "Nothing to commit — working tree is clean." -ForegroundColor Green
    
    # Deploy directly and exit
    Write-Host ""
    Write-Host "Deploying to Firebase..." -ForegroundColor Yellow
    firebase deploy
    
    Write-Host ""
    Write-Host "All done! Site is live at https://cb-deliverables.web.app" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# --- 3. Commit ---
Write-Host "Committing: $Message" -ForegroundColor Yellow
& $GIT commit -m $Message

# --- 4. Push to GitHub ---
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
& $GIT push origin main
Write-Host "GitHub updated." -ForegroundColor Green

# --- 5. Deploy to Firebase ---
Write-Host ""
Write-Host "Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy

Write-Host ""
Write-Host "All done! Site is live at https://cb-deliverables.web.app" -ForegroundColor Green
Write-Host ""
