# ============================================================
#  deploy.ps1  —  Commit, push to GitHub & deploy to Firebase
#  Usage: .\deploy.ps1 "Your commit message"
# ============================================================

param(
    [string]$Message = "chore: update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
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
    $GIT = (Get-Command git -ErrorAction SilentlyContinue)?.Source
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
if (-not $status) {
    Write-Host "Nothing to commit — working tree is clean." -ForegroundColor Green
} else {
    # --- 3. Commit ---
    Write-Host "Committing: $Message" -ForegroundColor Yellow
    & $GIT commit -m $Message

    # --- 4. Push to GitHub ---
    Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
    & $GIT push origin main
    Write-Host "GitHub updated." -ForegroundColor Green
}

# --- 5. Deploy to Firebase ---
Write-Host ""
Write-Host "Deploying to Firebase..." -ForegroundColor Yellow
firebase deploy

Write-Host ""
Write-Host "All done! Site is live at https://cb-deliverables.web.app" -ForegroundColor Green
Write-Host ""
