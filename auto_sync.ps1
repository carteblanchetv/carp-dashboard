# ============================================================
#  auto_sync.ps1  —  Auto-commit and push changes to GitHub
#  Run by Windows Task Scheduler on a schedule.
# ============================================================

$GIT       = "C:\Program Files\Git\cmd\git.exe"
$REPO_DIR  = "C:\Users\lizzy\.gemini\antigravity\scratch\cb_forms"
$LOG_FILE  = "$REPO_DIR\auto_sync.log"
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log($msg) {
    $line = "[$TIMESTAMP] $msg"
    Add-Content -Path $LOG_FILE -Value $line
}

# Keep log under 500 lines
if (Test-Path $LOG_FILE) {
    $lines = Get-Content $LOG_FILE
    if ($lines.Count -gt 500) {
        $lines | Select-Object -Last 400 | Set-Content $LOG_FILE
    }
}

Set-Location $REPO_DIR

# Check for changes
$status = & $GIT status --porcelain 2>&1
if (-not $status) {
    Write-Log "No changes. Nothing to sync."
    exit 0
}

Write-Log "Changes detected. Syncing..."

# Stage all
& $GIT add -A 2>&1 | ForEach-Object { Write-Log $_ }

# Commit with timestamp
$commitMsg = "auto-sync: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
& $GIT commit -m $commitMsg 2>&1 | ForEach-Object { Write-Log $_ }

# Push
$pushResult = & $GIT push origin main 2>&1
$pushResult | ForEach-Object { Write-Log $_ }

Write-Log "Sync complete."
