param(
  [Parameter(Mandatory = $true)]
  [string]$IdentityPath
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $IdentityPath -ErrorAction Stop).Path
$item = Get-Item -LiteralPath $resolved -Force
if ($item.PSIsContainer) { throw "Identity path must be a file: $resolved" }

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Invoke-Icacls {
  param([string[]]$Arguments)
  & "$env:SystemRoot\System32\icacls.exe" @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "icacls failed with exit code $LASTEXITCODE"
  }
}

# NTFS does not expose POSIX 0600 through Node's stat API. Enforce the actual
# Windows equivalent: no inherited readers/writers, with access limited to the
# current owner, LocalSystem, and the local Administrators group.
Invoke-Icacls @($resolved, '/inheritance:r')
Invoke-Icacls @(
  $resolved,
  '/grant:r',
  "*$currentSid`:(F)",
  '*S-1-5-18:(F)',
  '*S-1-5-32-544:(F)'
)

Write-Output 'Secured standalone identity ACL for the current user, SYSTEM, and Administrators.'
