$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument '"C:\Users\lizzy\.gemini\antigravity\scratch\cb_forms\auto_sync.vbs"'
$trigger  = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 30) -Once -At (Get-Date)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -StartWhenAvailable

Register-ScheduledTask `
    -TaskName   'CB-Deliverables GitHub Sync' `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -Description 'Auto-commits and pushes cb-deliverables changes to GitHub every 30 minutes' `
    -Force

Write-Host 'Scheduled task registered successfully.' -ForegroundColor Green
