param([string]$RepoPath)
Set-Location $RepoPath
while ($true) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  npx tsc --noEmit *> 'tsc-noemit-last.log'
  if ($LASTEXITCODE -eq 0) {
    "[$stamp] OK" | Out-File -FilePath 'tsc-noemit-status.log' -Append
  } else {
    "[$stamp] FAIL" | Out-File -FilePath 'tsc-noemit-status.log' -Append
  }
  Start-Sleep -Seconds 30
}
