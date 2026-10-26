# Creates the same portable encrypted recovery bundle as backup.sh, without binary shell redirection.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$PassphraseFile, [switch]$PassThru)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Set-Location -LiteralPath $PSScriptRoot
$passphrase = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $PassphraseFile).Path).TrimEnd("`r", "`n")
if ([Text.Encoding]::UTF8.GetByteCount($passphrase) -lt 16 -or $passphrase.Contains("`n") -or $passphrase.Contains("`r")) { throw 'Use one line containing at least 16 bytes for the recovery passphrase.' }
$compose = @('compose', '--env-file', (Join-Path $PSScriptRoot '.env'), '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'))
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'release-images.yml')) { $compose += @('-f', (Join-Path $PSScriptRoot 'release-images.yml')) }
function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Backup Docker command failed (exit $LASTEXITCODE)." }
}
$name = 'infrascope-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$material = Join-Path $PSScriptRoot "backups/.$name.installation"
[IO.Directory]::CreateDirectory($material) | Out-Null
try {
    if ($env:OS -eq 'Windows_NT') {
        $owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $material /inheritance:r /grant:r "${owner}:(OI)(CI)(F)" '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Cannot protect recovery staging permissions.' }
    }
    Copy-Item -LiteralPath '.env' -Destination (Join-Path $material 'environment.env')
    foreach ($pair in @(@('data/machine-id/machine-id', 'machine-id'), @('data/license-cache/license.json', 'license.json'))) {
        if (Test-Path -LiteralPath $pair[0]) { Copy-Item -LiteralPath $pair[0] -Destination (Join-Path $material $pair[1]) }
    }
    Invoke-Docker ($compose + @('exec', '-T', 'postgres', 'sh', '-c', 'pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB" -f "$1"', 'sh', "/tmp/.$name.dump"))
    Invoke-Docker ($compose + @('cp', "postgres:/tmp/.$name.dump", (Join-Path $material 'database.dump')))
    $passphrase | & docker @compose exec -T nms python -m nms_service.recovery create --dump "/recovery/.$name.installation/database.dump" --installation-dir "/recovery/.$name.installation" --output "/recovery/$name.isbackup" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Recovery bundle creation failed.' }
    Write-Host "Encrypted recovery bundle: backups/$name.isbackup"
    Write-Host 'Copy it to independent storage and keep the passphrase separately.'
    if ($PassThru) { Get-Item -LiteralPath (Join-Path $PSScriptRoot "backups/$name.isbackup") }
} finally {
    $passphrase = $null
    foreach ($file in @('environment.env', 'machine-id', 'license.json', 'database.dump')) {
        $path = Join-Path $material $file
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    [IO.Directory]::Delete($material)
    & docker @compose exec -T postgres rm -f "/tmp/.$name.dump" | Out-Null
}
