param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl,

  [string]$WorkerName = "room-status-tracker",

  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "load-deployment-env.ps1")

$env:VITE_API_URL = $ApiUrl.TrimEnd("/")
$env:VITE_AUTH_MODE = "password"
$env:VITE_ALLOW_EMAIL_AUTH = "false"
$env:VITE_ALLOW_REGISTRATION = "false"
$env:VITE_SHOW_LOCAL_DEMO = "true"
$env:VITE_DEPLOYMENT_MODE = "controlled-demo"
$env:VITE_DEPLOY_NOTICE = "Controlled demo - real accounts use a shared hosted database. Local demo roles stay in this browser."
$env:RST_WORKER_NAME = $WorkerName

npm run build:cloudflare
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

if ($DryRun) {
  Write-Host "Dry run complete. Built .output/server for $WorkerName with API $env:VITE_API_URL"
  exit 0
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "CLOUDFLARE_API_TOKEN is not set. Create .env.deployment.local with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
}
if (-not $env:CLOUDFLARE_ACCOUNT_ID) {
  throw "CLOUDFLARE_ACCOUNT_ID is not set. Create .env.deployment.local with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
}

npx.cmd wrangler --cwd .output/server deploy
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deploy failed" }
