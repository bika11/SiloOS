# SiloOS Dashboard Sync
# Use this to push local changes to the Pi for instant HMR updates

$PI_IP = "10.0.124.90"
$SSH_KEY = ".\siloos_key"

Write-Host "🔄 Syncing Dashboard to Pi ($PI_IP)..." -ForegroundColor Cyan

# Sync src, public, and config files
scp -i $SSH_KEY -r -o BatchMode=yes -o StrictHostKeyChecking=no .\dashboard\src\* "siloos@${PI_IP}:/home/siloos/dashboard/src"
scp -i $SSH_KEY -r -o BatchMode=yes -o StrictHostKeyChecking=no .\dashboard\public\* "siloos@${PI_IP}:/home/siloos/dashboard/public"
scp -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=no .\dashboard\vite.config.ts "siloos@${PI_IP}:/home/siloos/dashboard/vite.config.ts"
scp -i $SSH_KEY -o BatchMode=yes -o StrictHostKeyChecking=no .\dashboard\index.html "siloos@${PI_IP}:/home/siloos/dashboard/index.html"

Write-Host "✅ Sync Complete! Check your laptop browser for HMR updates." -ForegroundColor Green
