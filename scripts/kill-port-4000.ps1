$ids = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($id in $ids) {
    try {
        Stop-Process -Id $id -Force -ErrorAction Stop
        Write-Host "Killed $id"
    } catch {
        Write-Host "Failed $id"
    }
}
Start-Sleep -Milliseconds 800
$remaining = (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Remaining: $remaining"
