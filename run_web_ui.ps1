# Tableau to Power BI — Launch Web UI
param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

Write-Host "🚀 Starting Tableau to Power BI Web Suite on http://localhost:$Port ..." -ForegroundColor Cyan

# Launch browser automatically
Start-Process "http://localhost:$Port"

# Run Python server
& python web/server.py --port $Port
