# Windows PowerShell 5.1 / PowerShell 7; Docker Desktop must use Linux containers.
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$AppPort = 8170,
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$ProjectName,
    [string]$PublicIp = '',
    [ValidateRange(1,65535)][int]$HttpsPort=443,
    [ValidateRange(1,65535)][int]$BackendPort=18170,
    [string]$PassphraseFile='',
    [switch]$ConfigureOnly,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Set-Location -LiteralPath $PSScriptRoot
$releaseHelper = Join-Path $PSScriptRoot 'release-common.ps1'
$installationLock = $null
if (Test-Path -LiteralPath $releaseHelper) {
    . $releaseHelper
    . (Join-Path $PSScriptRoot 'release-https.ps1')
    $installationLock = Enter-ReleaseLock $PSScriptRoot
}
try {

function Invoke-Docker {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker failed (exit $LASTEXITCODE). Check Docker Desktop and the service logs." }
}
function New-Secret {
    param([switch]$Hex)
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    if ($Hex) { return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant() }
    return [Convert]::ToBase64String($bytes)
}
function Get-ArchiveHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose(); $stream.Dispose() }
}
$envPath = Join-Path $PSScriptRoot '.env'
if($PublicIp){
    $parsed=$null
    if(-not [Net.IPAddress]::TryParse($PublicIp,[ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.ToString() -cne $PublicIp -or $PublicIp -in @('0.0.0.0','255.255.255.255')){throw 'Use a canonical server IPv4 address.'}
    if(-not $PassphraseFile){throw 'HTTPS installation requires a recovery PassphraseFile.'}
    $PassphraseFile=(Resolve-Path -LiteralPath $PassphraseFile).Path
    if([Text.Encoding]::UTF8.GetByteCount([IO.File]::ReadAllText($PassphraseFile).TrimEnd("`r","`n")) -lt 16){throw 'Recovery passphrase must contain at least16 bytes.'}
    if(@($AppPort,$HttpsPort,$BackendPort|Sort-Object -Unique).Count -ne 3){throw 'HTTPS, legacy HTTP and backend ports must differ.'}
}
$newInstallation = -not (Test-Path -LiteralPath $envPath)
if ($newInstallation) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'env.example') -Destination $envPath }
Protect-ReleasePrivateFile -Path $envPath
$lines = [Collections.Generic.List[string]]::new()
foreach ($line in [IO.File]::ReadAllLines($envPath)) { $lines.Add($line) }
function Get-Setting([string]$Key) {
    foreach ($line in $lines) { if ($line.StartsWith("${Key}=")) { return $line.Substring($Key.Length + 1) } }
    return ''
}
function Set-Setting([string]$Key, [string]$Value) {
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index].StartsWith("${Key}=")) { $lines[$index] = "${Key}=${Value}"; return }
    }
    $lines.Add("${Key}=${Value}")
}
foreach ($key in @('POSTGRES_PASSWORD', 'NEXTAUTH_SECRET', 'INTEGRATION_CREDENTIALS_KEY', 'NMS_INTERNAL_TOKEN')) {
    $existing = Get-Setting $key
    if ([string]::IsNullOrWhiteSpace($existing) -or $existing.StartsWith('change-me') -or $existing -eq 'infrascope-prod') {
        Set-Setting $key (New-Secret -Hex:($key -eq 'POSTGRES_PASSWORD'))
    }
}
if ($newInstallation -or ($PSBoundParameters.ContainsKey('AppPort') -and -not $PublicIp)) {
    Set-Setting 'APP_PORT' "$AppPort"
    Set-Setting 'APP_URL' "http://localhost:$AppPort"
    Set-Setting 'NEXTAUTH_URL' "http://localhost:$AppPort"
}
if ($ProjectName) { Set-Setting 'COMPOSE_PROJECT_NAME' $ProjectName }
if($PublicIp -and $newInstallation){
    $httpsUrl='https://'+$PublicIp+$(if($HttpsPort -eq 443){''}else{':'+$HttpsPort})
    Set-Setting 'APP_URL' $httpsUrl;Set-Setting 'NEXTAUTH_URL' $httpsUrl
}
$version = Get-Setting 'VERSION'
if ($version -notmatch '^\d+\.\d+\.\d+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$') { throw 'VERSION must be a pinned release in .env.' }
$onlineRelease = $null
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'release.json')) {
    $metadata = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release.json') -Raw | ConvertFrom-Json
    $onlineRelease = Test-ReleasePayload $PSScriptRoot $version $metadata.repository
}
Set-ReleasePrivateText -Path $envPath -Text (($lines -join [Environment]::NewLine)+[Environment]::NewLine)
foreach ($directory in @('data/machine-id', 'data/license-cache', 'certs', 'logs', 'images', 'backups/database')) {
    [IO.Directory]::CreateDirectory((Join-Path $PSScriptRoot $directory)) | Out-Null
}
if ($ConfigureOnly) { Write-Host 'Configuration prepared. Existing keys and settings were preserved.'; return }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install and start Docker Desktop, using Linux containers, then run install.ps1 again.' }
$platform = & docker info --format '{{.OSType}}/{{.Architecture}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait until its engine is running.' }
if ($platform -notin @('linux/x86_64', 'linux/amd64')) { throw "This package requires Docker Linux x86_64 containers; current engine: $platform" }
Invoke-Docker -Arguments @('compose', 'version')
$registry = Get-Setting 'REGISTRY'
$images = @(
    @{ Ref = "$registry/infrascope:$version"; File = "infrascope-$version.tar" },
    @{ Ref = "$registry/infrascope-nms:$version"; File = "infrascope-nms-$version.tar" },
    @{ Ref = 'postgres:16-alpine'; File = 'postgres-16-alpine.tar' }
)
if ($onlineRelease) {
    $images = @(
        @{ Ref = $onlineRelease.images.app; File = '' },
        @{ Ref = $onlineRelease.images.nms; File = '' },
        @{ Ref = $onlineRelease.images.postgres; File = '' }
    )
}
$manifestPath = Join-Path $PSScriptRoot 'images/image-manifest.json'
$manifest = if (Test-Path -LiteralPath $manifestPath) { Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json } else { $null }
foreach ($item in $images) {
    $archive = Join-Path $PSScriptRoot ("images/" + $item.File)
    if (-not $onlineRelease -and (Test-Path -LiteralPath $archive -PathType Leaf)) {
        if ($manifest) {
            $entry = @($manifest.images | Where-Object { $_.file -eq $item.File })
            if ($entry.Count -ne 1 -or (Get-ArchiveHash $archive) -ne $entry[0].sha256) {
                throw "Image archive checksum mismatch: $($item.File)"
            }
        }
        # Loading the bundled release also replaces any stale local tag.
        Invoke-Docker -Arguments @('load', '--input', $archive)
    } else { Invoke-Docker -Arguments @('pull', $item.Ref) }
    if (-not $onlineRelease -and $manifest) {
        $entry = @($manifest.images | Where-Object { $_.file -eq $item.File })
        $imageId = & docker image inspect $item.Ref --format '{{.Id}}'
        if ($LASTEXITCODE -ne 0 -or $entry.Count -ne 1 -or $imageId -ne $entry[0].id) { throw "Loaded image identity mismatch: $($item.Ref)" }
    }
}
$compose = @('compose', '--env-file', $envPath, '-f', (Join-Path $PSScriptRoot 'docker-compose.yml'))
if ($onlineRelease) { $compose += @('-f', (Join-Path $PSScriptRoot 'release-images.yml')) }
# Validate without printing resolved credentials.
Invoke-Docker ($compose + @('config', '--quiet'))
Invoke-Docker ($compose + @('run', '--rm', '--no-deps', '--user', '0', '--entrypoint', 'sh', 'app', '-c', 'chown 1001:1001 /app/.machine-id /app/.license-cache /app/logs'))
Invoke-Docker ($compose + @('up', '-d', '--wait', '--wait-timeout', '300', '--pull', 'never'))
if($PublicIp){
    $config=Get-ReleaseDockerJson ($compose+@('config','--format','json')) 'installation project'
    $https=Get-ReleaseHttpsContext -InstallationRoot $PSScriptRoot -Project $config.name -PublicIp $PublicIp -HttpsPort $HttpsPort -LegacyPort $AppPort -BackendPort $BackendPort
    $https=Enable-ReleaseHttps -Context $https -InstallationLock $installationLock -SourceRoot $PSScriptRoot
    $recoveryImage=if($onlineRelease){$onlineRelease.images.nms}else{''}
    Complete-ReleaseInitialRecovery -Context $https -RecoveryImage $recoveryImage -PassphraseFile $PassphraseFile -SourceRoot $PSScriptRoot
    Write-Host "Public CA certificate: $($https.CaPath)"
    Write-Host "CA SHA256: $($https.CaHash). Verify and trust only this public certificate on authorized clients."
}
$url = (Get-Setting 'APP_URL').TrimEnd('/') + '/setup'
Write-Host "Installation ready: $url"
Write-Host 'Complete setup with your customer license and create the first administrator.'
if (-not $NoBrowser) { Start-Process $url }
} finally { if ($installationLock) { $installationLock.Dispose() } }
