param([Parameter(Mandatory=$true)][int]$Id)
$p = Get-Process -Id $Id -ErrorAction SilentlyContinue
if (-not $p) { Write-Host "no such process"; exit }
$ci = Get-CimInstance Win32_Process -Filter "ProcessId=$Id"
[PSCustomObject]@{
  Id = $p.Id
  Name = $p.ProcessName
  Path = $p.Path
  Parent = $ci.ParentProcessId
  CommandLine = $ci.CommandLine
} | Format-List
