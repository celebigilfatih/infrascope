# Download this small asset from a trusted GitHub Release, inspect it, then run it locally.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Repository = 'celebigilfatih/infrascope',
    [string]$Destination = 'C:\InfraScope\infrascope',
    [ValidateRange(1, 65535)][int]$AppPort = 8170,
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$ProjectName = 'infrascope',
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Standalone bootstrap downloads the ZIP through GitHub's API and verifies its asset digest
# BEFORE loading the release helper or executing any downloaded script.
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'InfraScope-Windows-Bootstrap'; 'X-GitHub-Api-Version' = '2022-11-28' }
if ($env:GH_TOKEN) { $headers.Authorization = 'Bearer ' + $env:GH_TOKEN }
$destinationPath = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationPath) {
    if (@(Get-ChildItem -LiteralPath $destinationPath -Force).Count) { throw 'Destination must be empty. Use the installed update.ps1 to update an existing installation.' }
}
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/tags/v$Version" -Headers $headers -Method Get -TimeoutSec 60
if ($release.tag_name -cne "v$Version" -or $release.draft -or $release.prerelease) { throw 'Requested stable release is not published.' }
$assets = @($release.assets | Where-Object { $_.name -ceq "infrascope-windows-online-$Version.zip" })
if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:[a-f0-9]{64}$' -or
    $assets[0].url -notmatch ('^https://api\.github\.com/repos/' + [regex]::Escape($Repository) + '/releases/assets/[0-9]+$')) { throw 'Missing verified GitHub release asset.' }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('infrascope-release-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temporary) | Out-Null
try {
    $zip = Join-Path $temporary 'release.zip'
    $headers.Accept = 'application/octet-stream'
    Invoke-WebRequest -Uri $assets[0].url -Headers $headers -OutFile $zip -UseBasicParsing -TimeoutSec 300 | Out-Null
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $assets[0].digest.Substring(7)) { throw 'GitHub release ZIP checksum mismatch.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        # Flat allowlist prevents ZIP traversal or writes to existing customer state.
        $allowed = @('install.ps1', 'update.ps1', 'backup.ps1', 'release-common.ps1', 'docker-compose.yml', 'release-images.yml',
            'env.example', '.env.example', 'postgres-backup.sh', 'INSTALL_WINDOWS.md', 'BACKUP_OPERATIONS.md', 'release.json')
        if (@(Compare-Object @($allowed | ForEach-Object { "infrascope/$_" } | Sort-Object) @($archive.Entries.FullName | Sort-Object)).Count) { throw 'Unexpected files in installation ZIP.' }
        [IO.Directory]::CreateDirectory($destinationPath) | Out-Null
        foreach ($entry in $archive.Entries) {
            if ($entry.Length -gt 2MB) { throw 'Unexpectedly large release file.' }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $destinationPath $entry.Name), $false)
        }
    } finally { $archive.Dispose() }
    . (Join-Path $destinationPath 'release-common.ps1')
    Test-ReleasePayload $destinationPath $Version $Repository | Out-Null
    & (Join-Path $destinationPath 'install.ps1') -AppPort $AppPort -ProjectName $ProjectName -NoBrowser:$NoBrowser
} finally {
    # This exact GUID directory was created by this bootstrap under the OS temporary directory.
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
