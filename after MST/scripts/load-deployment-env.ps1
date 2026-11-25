param(
  [string]$Path = (Join-Path $PSScriptRoot "..\.env.deployment.local")
)

# Loads deployment secrets into the current process without printing them.
# Existing environment variables win, so CI/API tokens can override the file.
if (-not (Test-Path $Path)) {
  return
}

$loaded = 0
foreach ($raw in Get-Content $Path) {
  $line = $raw.Trim()
  if (-not $line -or $line.StartsWith("#")) { continue }

  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $name = $Matches[1]
    if (-not (Test-Path "env:$name")) {
      [Environment]::SetEnvironmentVariable($name, $Matches[2])
      $loaded++
    }
  }
}

if ($loaded -gt 0) {
  Write-Host "Loaded $loaded deployment variable(s) from $Path"
}
