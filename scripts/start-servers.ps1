# Start the production build of the app (UI + API) for the desktop wrapper / local smoke tests.
# Requires the environment described in frontend/.env.example (SECRET_KEY, SUPABASE_*).
$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "frontend\.next\standalone"

Write-Output "Starting OptiTrack WMS..."
$env:PORT = "3000"
$env:HOSTNAME = "0.0.0.0"
$proc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $server -PassThru -WindowStyle Hidden
Write-Output "Started with PID $($proc.Id)"

for ($i = 0; $i -lt 15; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:3000/livez" -TimeoutSec 2
        if ($res.status -eq "alive") { Write-Output "OptiTrack WMS is LIVE on http://localhost:3000"; break }
    } catch { Start-Sleep -Seconds 1 }
}
