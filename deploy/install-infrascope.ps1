# Download this small asset from a trusted GitHub Release, inspect it, then run it locally.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Repository = 'celebigilfatih/infrascope',
    [string]$Destination = 'C:\InfraScope\infrascope',
    [ValidateRange(1, 65535)][int]$AppPort = 8170,
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$ProjectName = 'infrascope',
    [switch]$Update,
    [string]$PassphraseFile,
    [string]$PublicIp='',
    [string]$HttpsDirectory='',
    [ValidateRange(0,65535)][int]$HttpsPort=0,
    [ValidateRange(0,65535)][int]$LegacyPort=0,
    [ValidateRange(0,65535)][int]$BackendPort=0,
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
if ($Update) {
    if (-not (Test-Path -LiteralPath (Join-Path $destinationPath '.env') -PathType Leaf)) { throw 'No existing installation at Destination.' }
    if ([string]::IsNullOrWhiteSpace($PassphraseFile)) { throw 'Update requires a recovery PassphraseFile.' }
    $PassphraseFile = (Resolve-Path -LiteralPath $PassphraseFile).Path
} elseif (Test-Path -LiteralPath $destinationPath) {
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
    $payloadRoot = Join-Path $temporary 'infrascope'
    $zip = Join-Path $temporary 'release.zip'
    $headers.Accept = 'application/octet-stream'
    Invoke-WebRequest -Uri $assets[0].url -Headers $headers -OutFile $zip -UseBasicParsing -TimeoutSec 300 | Out-Null
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $assets[0].digest.Substring(7)) { throw 'GitHub release ZIP checksum mismatch.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    try {
        # Exact, case-sensitive allowlist: no traversal, duplicate entries or customer state.
        $allowed = @('install.ps1', 'update.ps1', 'backup.ps1', 'release-common.ps1', 'release-https.ps1', 'docker-compose.yml', 'release-images.yml',
            'env.example', '.env.example', 'postgres-backup.sh', 'INSTALL_WINDOWS.md', 'BACKUP_OPERATIONS.md', 'release.json',
            'https/Caddyfile', 'https/Redirectfile', 'https/compose.yml', 'https/redirect-compose.yml',
            'https/install-https.ps1', 'https/install-redirect.ps1', 'https/private-files.ps1', 'https/README.txt', 'https/README-REDIRECT.txt')
        if (@(Compare-Object @($allowed | ForEach-Object { "infrascope/$_" } | Sort-Object) @($archive.Entries.FullName | Sort-Object) -CaseSensitive).Count) { throw 'Unexpected files in installation ZIP.' }
        [IO.Directory]::CreateDirectory($payloadRoot) | Out-Null
        foreach ($entry in $archive.Entries) {
            if ($entry.Length -gt 2MB) { throw 'Unexpectedly large release file.' }
            $file = Join-Path $payloadRoot $entry.FullName.Substring('infrascope/'.Length)
            [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $file, $false)
        }
    } finally { $archive.Dispose() }
    . (Join-Path $payloadRoot 'release-common.ps1')
    Test-ReleasePayload $payloadRoot $Version $Repository | Out-Null
    if ($Update) {
        # Use the verified candidate updater; an installed1.0.9 helper has an older ZIP allowlist.
        & (Join-Path $payloadRoot 'update.ps1') -Version $Version -Repository $Repository -PassphraseFile $PassphraseFile -InstallationRoot $destinationPath -PublicIp $PublicIp -HttpsDirectory $HttpsDirectory -HttpsPort $HttpsPort -LegacyPort $LegacyPort -BackendPort $BackendPort
    } else {
        if(-not $PublicIp -or -not $PassphraseFile){throw 'New online installations require PublicIp and a recovery PassphraseFile. Use the HTTPS installation guide.'}
        $PassphraseFile=(Resolve-Path -LiteralPath $PassphraseFile).Path
        if ((Test-Path -LiteralPath $destinationPath) -and @(Get-ChildItem -LiteralPath $destinationPath -Force).Count) { throw 'Destination changed during download; refusing to overwrite it.' }
        [IO.Directory]::CreateDirectory($destinationPath) | Out-Null
        foreach ($name in $allowed) {
            $file = Join-Path $destinationPath $name
            [IO.Directory]::CreateDirectory((Split-Path -Parent $file)) | Out-Null
            [IO.File]::Copy((Join-Path $payloadRoot $name), $file, $false)
        }
        $installOptions=@{AppPort=$AppPort;ProjectName=$ProjectName;NoBrowser=$NoBrowser;PublicIp=$PublicIp;PassphraseFile=$PassphraseFile}
        if($HttpsPort){$installOptions.HttpsPort=$HttpsPort};if($BackendPort){$installOptions.BackendPort=$BackendPort}
        & (Join-Path $destinationPath 'install.ps1') @installOptions
    }
} finally {
    # This exact GUID directory was created by this bootstrap under the OS temporary directory.
    $resolved = [IO.Path]::GetFullPath($temporary)
    if ((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-release-[a-f0-9]{32}$') { throw 'Unexpected release cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
