Write-Output "Starting backend and frontend background services..."

# Start Backend API
$backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d C:\Users\bostz\.gemini\antigravity\scratch\Optitrack-WMS\backend && uv run --with-requirements requirements.txt uvicorn main:app --host 127.0.0.1 --port 8000" -PassThru -WindowStyle Hidden
Write-Output "Backend started with PID $($backendProcess.Id)"

# Start Frontend Standalone Server
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d C:\Users\bostz\.gemini\antigravity\scratch\Optitrack-WMS\frontend\.next\standalone && set PORT=3000 && set HOSTNAME=0.0.0.0 && node server.js" -PassThru -WindowStyle Hidden
Write-Output "Frontend started with PID $($frontendProcess.Id)"

# Wait for healthy
Start-Sleep -Seconds 3

# Check Backend
for ($i = 0; $i -lt 10; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/livez" -TimeoutSec 2
        if ($res.status -eq "alive") {
            Write-Output "Backend is LIVE!"
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

# Check Frontend
for ($i = 0; $i -lt 10; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3000/" -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            Write-Output "Frontend is LIVE!"
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}