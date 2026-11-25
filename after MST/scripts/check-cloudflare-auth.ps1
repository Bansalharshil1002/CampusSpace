$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "load-deployment-env.ps1")

if (-not $env:CLOUDFLARE_API_TOKEN) {
  throw "CLOUDFLARE_API_TOKEN is not set. Create .env.deployment.local with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
}

npx.cmd wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Cloudflare token is invalid or missing permissions" }
