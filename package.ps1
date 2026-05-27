param(
  [string]$OutDir = ".\dist",
  [string]$Name = "luck"
)

# Ensure running from script folder
$scriptPath = Split-Path -Path $MyInvocation.MyCommand.Path -Parent
Set-Location $scriptPath

if(-not (Test-Path $OutDir)){
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$zip = Join-Path $OutDir ("$Name-$timestamp.zip")

# Collect files/folders to include (exclude the dist folder itself)
$items = Get-ChildItem -Path . -Recurse -Force |
  Where-Object { $_.FullName -notmatch "\\dist\\" -and $_.Name -ne ".git" -and $_.Name -ne ".vs" } |
  Select-Object -ExpandProperty FullName

if($items.Count -eq 0){ Write-Host "No files found to package."; exit 1 }

Compress-Archive -Path $items -DestinationPath $zip -Force

Write-Host "Created package:" $zip
