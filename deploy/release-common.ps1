# Shared release transport and validation. Compatible with Windows PowerShell 5.1.
Set-StrictMode -Version Latest
$script:ReleaseFiles = @('install.ps1', 'update.ps1', 'backup.ps1', 'release-common.ps1', 'release-https.ps1',
    'docker-compose.yml', 'release-images.yml', 'env.example', '.env.example',
    'postgres-backup.sh', 'INSTALL_WINDOWS.md', 'BACKUP_OPERATIONS.md',
    'https/Caddyfile', 'https/Redirectfile', 'https/compose.yml', 'https/redirect-compose.yml',
    'https/install-https.ps1', 'https/install-redirect.ps1', 'https/README.txt', 'https/README-REDIRECT.txt')

function Invoke-ReleaseDocker([string[]]$Arguments) {
    & docker @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed (exit $LASTEXITCODE). Existing data has not been deleted." }
}
function Assert-ReleaseDocker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install and start Docker Desktop with Linux containers.' }
    $platform = & docker info --format '{{.OSType}}/{{.Architecture}}'
    if ($LASTEXITCODE -ne 0 -or $platform -notin @('linux/x86_64', 'linux/amd64')) { throw 'Docker Linux x86_64 engine must be running.' }
    Invoke-ReleaseDocker @('compose', 'version')
}
function Get-ReleaseHash([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Get-ReleaseSetting([string]$Path, [string]$Key) {
    $values = @([IO.File]::ReadAllLines($Path) | Where-Object { $_.StartsWith("${Key}=") })
    if ($values.Count -gt 1) { throw "Duplicate setting in ENV: $Key" }
    if ($values.Count -eq 1) { return $values[0].Substring($Key.Length + 1) }
    return ''
}
function Write-ReleaseJson([string]$Path, $Value) {
    $temporary = $Path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($temporary, ($Value | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Set-ReleaseVersion([string]$Path, [string]$Version) {
    $text = [IO.File]::ReadAllText($Path)
    if ([regex]::Matches($text, '(?m)^VERSION=[^\r\n]*').Count -ne 1) { throw 'ENV must contain exactly one VERSION setting.' }
    $updated = [regex]::Replace($text, '(?m)^VERSION=[^\r\n]*', "VERSION=$Version")
    $temporary = $Path + '.update-tmp'
    [IO.File]::WriteAllText($temporary, $updated, [Text.UTF8Encoding]::new($false))
    if ($env:OS -eq 'Windows_NT') { Set-Acl -LiteralPath $temporary -AclObject (Get-Acl -LiteralPath $Path) }
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Enter-ReleaseLock([string]$Root) {
    try { return [IO.File]::Open((Join-Path $Root '.update.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
    catch { throw 'Another installation/update is running. Wait for it to finish.' }
}
function Test-ReleasePayload([string]$Root, [string]$Version, [string]$Repository) {
    $manifest = Get-Content -LiteralPath (Join-Path $Root 'release.json') -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 2 -or $manifest.version -cne $Version -or $manifest.repository -cne $Repository -or
        $manifest.revision -notmatch '^[a-f0-9]{40,64}$') { throw 'Release metadata does not match the requested repository/version.' }
    $names = @($manifest.files.PSObject.Properties.Name)
    if (@(Compare-Object ($script:ReleaseFiles | Sort-Object) ($names | Sort-Object) -CaseSensitive).Count) { throw 'Unexpected release file list.' }
    foreach ($name in $script:ReleaseFiles) {
        $path = Join-Path $Root $name
        $expected = $manifest.files.$name
        if ($expected -notmatch '^[a-f0-9]{64}$' -or -not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-ReleaseHash $path) -cne $expected) {
            throw "Release file checksum mismatch: $name"
        }
    }
    $owner = $Repository.Split('/')[0].ToLowerInvariant()
    foreach ($pair in @(@('app', "ghcr.io/$owner/infrascope-customer"), @('nms', "ghcr.io/$owner/infrascope-customer-nms"), @('postgres', 'postgres'))) {
        $reference = $manifest.images.($pair[0])
        if ($reference -cnotmatch ('^' + [regex]::Escape($pair[1]) + '@sha256:[a-f0-9]{64}$')) { throw "Invalid pinned image: $($pair[0])" }
    }
    # Rebuild the override from validated metadata; do not trust a Compose override to add mounts/ports.
    $pins = "services:`n"
    foreach ($service in @('app', 'nms', 'postgres', 'database-backup')) {
        $key = if ($service -eq 'database-backup') { 'postgres' } else { $service }
        $pins += "  ${service}:`n    image: $($manifest.images.$key)`n"
    }
    if ([IO.File]::ReadAllText((Join-Path $Root 'release-images.yml')).Replace("`r`n", "`n") -cne $pins) { throw 'Release image override differs from the manifest.' }
    return $manifest
}
function Get-ReleasePackage([string]$Version, [string]$Repository) {
    if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Choose an explicit stable version, for example 1.0.2; latest is not accepted.' }
    if ($Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$') { throw 'Repository must be owner/name.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $headers = @{ Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'InfraScope-Windows-Installer' }
    # Credentials stay in process memory; never put them in .env, command arguments, logs or the package.
    if ($env:GH_TOKEN) { $headers.Authorization = 'Bearer ' + $env:GH_TOKEN }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repository/releases/tags/v$Version" -Headers $headers -Method Get -TimeoutSec 60
    if ($release.tag_name -cne "v$Version" -or $release.draft -or $release.prerelease) { throw 'Requested stable release is not published.' }
    $name = "infrascope-windows-online-$Version.zip"
    $assets = @($release.assets | Where-Object { $_.name -ceq $name })
    if ($assets.Count -ne 1 -or $assets[0].digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Release ZIP or GitHub asset SHA-256 digest is missing.' }
    if ($assets[0].url -notmatch ('^https://api\.github\.com/repos/' + [regex]::Escape($Repository) + '/releases/assets/[0-9]+$')) { throw 'Unexpected GitHub asset URL.' }
    $expectedHash = $assets[0].digest.Substring(7)
    $stage = Join-Path ([IO.Path]::GetTempPath()) ('infrascope-release-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    try {
        $archivePath = Join-Path $stage 'release.zip'
        $headers.Accept = 'application/octet-stream'
        Invoke-WebRequest -Uri $assets[0].url -Headers $headers -OutFile $archivePath -UseBasicParsing -TimeoutSec 300 | Out-Null
        if ((Get-ReleaseHash $archivePath) -cne $expectedHash) { throw 'GitHub release ZIP checksum mismatch. No installation files were changed.' }
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
        $root = Join-Path $stage 'infrascope'
        [IO.Directory]::CreateDirectory($root) | Out-Null
        try {
            $expected = @($script:ReleaseFiles + 'release.json' | ForEach-Object { "infrascope/$_" })
            $entries = @($archive.Entries.FullName)
            if (@(Compare-Object ($expected | Sort-Object) ($entries | Sort-Object) -CaseSensitive).Count) { throw 'Unsafe or unexpected files in release ZIP.' }
            foreach ($entry in $archive.Entries) {
                if ($entry.Length -gt 2MB) { throw 'Unexpectedly large release file.' }
                $relative = $entry.FullName.Substring('infrascope/'.Length)
                $destination = Join-Path $root $relative
                [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $false)
            }
        } finally { $archive.Dispose() }
        $manifest = Test-ReleasePayload $root $Version $Repository
        return [pscustomobject]@{ Root = $root; Stage = $stage; Manifest = $manifest; Hash = $expectedHash }
    } catch { Remove-ReleaseStage $stage; throw }
}
function Remove-ReleaseStage([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path -Leaf $resolved) -notmatch '^infrascope-release-[a-f0-9]{32}$') { throw 'Unexpected release staging path.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
function Get-ReleaseCompose([string]$Root, [string]$Project = '') {
    $arguments = @('compose', '--project-directory', $Root, '--env-file', (Join-Path $Root '.env'), '-f', (Join-Path $Root 'docker-compose.yml'))
    if (Test-Path -LiteralPath (Join-Path $Root 'release-images.yml')) { $arguments += @('-f', (Join-Path $Root 'release-images.yml')) }
    if ($Project) { $arguments += @('-p', $Project) }
    return $arguments
}
