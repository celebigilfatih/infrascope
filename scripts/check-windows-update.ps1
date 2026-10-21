# Runs the real updater against an in-memory GitHub fixture and a Docker command double.
# No daemon, account, database or customer installation is touched.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$FixtureZip)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('infrascope-update-check-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$original = (Get-Location).Path
$global:UpdateFixture = (Resolve-Path -LiteralPath $FixtureZip).Path
$global:Calls = [Collections.Generic.List[string]]::new()
$global:FailAt = ''
$global:AssetHash = (Get-FileHash -LiteralPath $global:UpdateFixture -Algorithm SHA256).Hash.ToLowerInvariant()
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function global:Invoke-RestMethod {
    param($Uri, $Headers, $Method, $TimeoutSec)
    $global:Calls.Add('github release')
    if ($global:FailAt -eq 'network') { throw 'Synthetic disconnected network' }
    if ($global:FailAt -in @('401', '403')) { throw "Synthetic HTTP $global:FailAt" }
    $tag = if ($global:FailAt -eq 'wrong-version') { 'v8.8.8' } else { 'v1.0.2' }
    return [pscustomobject]@{ tag_name = $tag; draft = $false; prerelease = $false; assets = @(
        [pscustomobject]@{ name = 'infrascope-windows-online-1.0.2.zip'; digest = "sha256:$global:AssetHash";
            url = 'https://api.github.com/repos/celebigilfatih/infrascope/releases/assets/123' }) }
}
function global:Invoke-WebRequest {
    param($Uri, $Headers, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
    $global:Calls.Add('download')
    Copy-Item -LiteralPath $global:UpdateFixture -Destination $OutFile
}
function global:docker {
    $arguments = @($args)
    $call = $arguments -join ' '
    $global:Calls.Add($call)
    $global:LASTEXITCODE = 0
    if ($call -eq 'info --format {{.OSType}}/{{.Architecture}}') { return 'linux/x86_64' }
    if ($call -match 'config --format json') { return '{"name":"preserved-customer-project"}' }
    if ($call -match 'image inspect.*Architecture') { return 'linux/amd64' }
    if ($global:FailAt -eq 'candidate-config' -and $call -match 'infrascope-release-.*config --quiet') { $global:LASTEXITCODE = 16; return }
    if ($global:FailAt -eq 'pull' -and $arguments[0] -eq 'pull') { $global:LASTEXITCODE = 17; return }
    if ($global:FailAt -eq 'start' -and $call -match 'up -d') { $global:LASTEXITCODE = 18; return }
}
$envText = @'
# Customer settings: preserve all bytes except the VERSION value.
VERSION=1.0.1
REGISTRY=ghcr.io/celebigilfatih
APP_PORT=18173
APP_URL=http://localhost:18173
COMPOSE_PROJECT_NAME=preserved-customer-project
LICENSE_KEY=synthetic-customer-license
POSTGRES_PASSWORD=synthetic-local-db-only
NEXTAUTH_SECRET=preserve-session-key
INTEGRATION_CREDENTIALS_KEY=preserve-encryption-key
NMS_INTERNAL_TOKEN=preserve-service-key
CUSTOM_SETTING=customer-$value
'@
function New-Installation([string]$Name) {
    $root = Join-Path $scratch $Name
    [IO.Directory]::CreateDirectory($root) | Out-Null
    foreach ($name in @('update.ps1', 'release-common.ps1', 'docker-compose.yml')) {
        Copy-Item -LiteralPath (Join-Path $source "deploy/$name") -Destination $root
    }
    [IO.File]::WriteAllText((Join-Path $root '.env'), $envText, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $root 'backup.ps1'), @'
param([string]$PassphraseFile, [switch]$PassThru)
$global:Calls.Add('backup')
if ($global:FailAt -eq 'backup') { throw 'Synthetic backup failure' }
$path = Join-Path $PSScriptRoot 'backups/fixture.isbackup'
[IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
[IO.File]::WriteAllText($path, 'synthetic encrypted bundle fixture')
if ($PassThru) { Get-Item -LiteralPath $path }
'@)
    foreach ($name in @('data/machine-id/machine-id', 'data/license-cache/license.json', 'certs/customer-ca.pem')) {
        $path = Join-Path $root $name
        [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
        [IO.File]::WriteAllText($path, "preserve:$name")
    }
    return $root
}
function Run-Update([string]$Root) {
    & (Join-Path $Root 'update.ps1') -Version 1.0.2 -PassphraseFile (Join-Path $scratch 'passphrase.txt')
}
try {
    [IO.File]::WriteAllText((Join-Path $scratch 'passphrase.txt'), 'synthetic recovery passphrase')
    # RED before implementation: these scripts must exist, then exercise their real control flow.
    Assert (Test-Path -LiteralPath (Join-Path $source 'deploy/update.ps1')) 'Windows updater is missing.'
    foreach ($failure in @('network', '401', '403', 'wrong-version', 'candidate-config', 'pull', 'backup', 'checksum')) {
        $root = New-Installation $failure
        $global:Calls.Clear(); $global:FailAt = $failure
        if ($failure -eq 'checksum') { $global:AssetHash = '0' * 64 }
        $failed = $false
        try { Run-Update $root } catch { $failed = $true; Write-Host "Expected error ($failure): $($_.Exception.Message)" }
        Assert $failed "Expected failure: $failure"
        Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $envText) "ENV changed on $failure"
        Assert (-not (@($global:Calls | Where-Object { $_ -match 'stop app nms|up -d' }).Count)) "Services changed on $failure"
        Assert (-not (Test-Path -LiteralPath (Join-Path $root '.update-state.json'))) "Update journal written on $failure"
        $global:AssetHash = (Get-FileHash -LiteralPath $global:UpdateFixture -Algorithm SHA256).Hash.ToLowerInvariant()
        Write-Host "PASS: $failure preserves customer state and running services."
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $goodFixture = $global:UpdateFixture
    foreach ($corruption in @('traversal', 'payload-hash')) {
        $badZip = Join-Path $scratch "$corruption.zip"
        Copy-Item -LiteralPath $goodFixture -Destination $badZip
        $zip = [IO.Compression.ZipFile]::Open($badZip, [IO.Compression.ZipArchiveMode]::Update)
        try {
            $entryName = if ($corruption -eq 'traversal') { 'infrascope/../.env' } else { 'infrascope/install.ps1' }
            if ($corruption -eq 'payload-hash') { $zip.GetEntry($entryName).Delete() }
            $entry = $zip.CreateEntry($entryName)
            $writer = [IO.StreamWriter]::new($entry.Open())
            try { $writer.Write('tampered fixture') } finally { $writer.Dispose() }
        } finally { $zip.Dispose() }
        $global:UpdateFixture = $badZip
        $global:AssetHash = (Get-FileHash -LiteralPath $badZip -Algorithm SHA256).Hash.ToLowerInvariant()
        $global:FailAt = ''; $global:Calls.Clear()
        $root = New-Installation $corruption
        $rejected = $false
        try { Run-Update $root } catch { $rejected = $_.Exception.Message -match 'Unsafe or unexpected files|file checksum mismatch' }
        Assert $rejected "Unsafe release ZIP accepted: $corruption"
        Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $envText) "Unsafe ZIP changed ENV: $corruption"
        Assert (-not (@($global:Calls | Where-Object { $_ -match 'stop app nms|up -d|^backup$' }).Count)) 'Unsafe ZIP reached deployment.'
        Write-Host "PASS: $corruption release rejected before deployment."
    }
    $global:UpdateFixture = $goodFixture
    $global:AssetHash = (Get-FileHash -LiteralPath $goodFixture -Algorithm SHA256).Hash.ToLowerInvariant()
    $root = New-Installation 'success'
    $global:Calls.Clear(); $global:FailAt = ''
    Run-Update $root
    $capturedCalls = @($global:Calls)
    Assert ($capturedCalls.IndexOf('backup') -ge 0) 'No mandatory backup.'
    $stopIndex = -1
    for ($i = 0; $i -lt $capturedCalls.Count; $i++) { if ($capturedCalls[$i] -match 'stop app nms') { $stopIndex = $i } }
    Assert ($stopIndex -gt $capturedCalls.IndexOf('backup')) 'Service stop happened before backup.'
    Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $envText.Replace('VERSION=1.0.1', 'VERSION=1.0.2')) 'Customer settings changed.'
    foreach ($name in @('data/machine-id/machine-id', 'data/license-cache/license.json', 'certs/customer-ca.pem')) {
        Assert ([IO.File]::ReadAllText((Join-Path $root $name)) -ceq "preserve:$name") "Customer file changed: $name"
    }
    Assert (-not (@($capturedCalls | Where-Object { $_ -match '(^| )(down|prune|load)( |$)|volume rm' }).Count)) 'Unsafe Docker operation.'
    Assert (@($capturedCalls | Where-Object { $_ -match 'up -d.*--wait.*--pull never' }).Count -eq 1) 'Missing bounded readiness/pull policy.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $root '.update-state.json'))) 'Completed journal not archived.'
    $global:Calls.Clear()
    Run-Update $root
    Assert (-not (@($global:Calls | Where-Object { $_ -match 'backup|stop app nms|up -d' }).Count)) 'Same-version update repeated.'
    Write-Host 'PASS: backed-up digest-pinned update preserves ENV/identity/certificates; repeat is a no-op.'
    $global:Calls.Clear()
    $rejected = $false
    try { & (Join-Path $root 'update.ps1') -Version 1.0.1 -PassphraseFile (Join-Path $scratch 'passphrase.txt') } catch { $rejected = $_.Exception.Message -match 'Downgrades' }
    Assert $rejected 'Unsafe downgrade was accepted.'
    Assert (-not $global:Calls.Count) 'Downgrade performed remote/Docker actions.'
    . (Join-Path $source 'deploy/release-common.ps1')
    $heldLock = Enter-ReleaseLock $root
    try {
        $rejected = $false
        try { Run-Update $root } catch { $rejected = $_.Exception.Message -match 'Another installation/update' }
        Assert $rejected 'Concurrent update was accepted.'
    } finally { $heldLock.Dispose() }
    Write-Host 'PASS: downgrade and concurrent update are refused.'

    # Standalone bootstrap: integrity failure cannot write the destination; valid installation uses the real installer.
    $bootstrapRoot = Join-Path $scratch 'bootstrap destination with spaces'
    $global:AssetHash = '0' * 64
    $rejected = $false
    try { & (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.2 -Destination $bootstrapRoot -NoBrowser } catch { $rejected = $_.Exception.Message -match 'checksum mismatch' }
    Assert $rejected 'Bootstrap ignored the GitHub asset digest.'
    Assert (-not (Test-Path -LiteralPath $bootstrapRoot)) 'Unverified bootstrap wrote installation files.'
    $global:AssetHash = (Get-FileHash -LiteralPath $global:UpdateFixture -Algorithm SHA256).Hash.ToLowerInvariant()
    & (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.2 -Destination $bootstrapRoot -NoBrowser -ProjectName customer-bootstrap-check -AppPort 18179
    $bootstrapEnv = [IO.File]::ReadAllText((Join-Path $bootstrapRoot '.env'))
    Assert ($bootstrapEnv.Contains('VERSION=1.0.2') -and $bootstrapEnv.Contains('COMPOSE_PROJECT_NAME=customer-bootstrap-check')) 'Bootstrap lost version or project.'
    $rejected = $false
    try { & (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.2 -Destination $bootstrapRoot -NoBrowser } catch { $rejected = $_.Exception.Message -match 'Destination must be empty' }
    Assert $rejected 'Bootstrap overwrote an existing customer installation.'
    Write-Host 'PASS: standalone bootstrap verifies the asset before writing and refuses existing installations.'

    $root = New-Installation 'resume'
    $global:Calls.Clear(); $global:FailAt = 'start'
    $failed = $false
    try { Run-Update $root } catch { $failed = $true; Write-Host "Expected startup error: $($_.Exception.Message)" }
    Assert $failed 'Expected startup failure.'
    Assert (Test-Path -LiteralPath (Join-Path $root '.update-state.json')) 'Interrupted update cannot be resumed.'
    Assert ([IO.File]::ReadAllText((Join-Path $root '.env')).Contains('VERSION=1.0.2')) 'Unsafe automatic ENV rollback after possible migration.'
    $global:FailAt = ''
    $rejected = $false
    try { & (Join-Path $root 'update.ps1') -Version 1.0.3 -PassphraseFile (Join-Path $scratch 'passphrase.txt') } catch { $rejected = $_.Exception.Message -match 'interrupted update' }
    Assert $rejected 'Interrupted update allowed a different target release.'
    $backupPath = Join-Path $root 'backups/fixture.isbackup'
    $backupBytes = [IO.File]::ReadAllBytes($backupPath)
    [IO.File]::AppendAllText($backupPath, 'tampered')
    $rejected = $false
    try { Run-Update $root } catch { $rejected = $_.Exception.Message -match 'recovery bundle is missing or changed' }
    Assert $rejected 'Interrupted update resumed with a tampered backup.'
    [IO.File]::WriteAllBytes($backupPath, $backupBytes)
    # Replacement backup script must not be invoked on resume: preserve the original recovery point.
    [IO.File]::WriteAllText((Join-Path $root 'backup.ps1'), "throw 'Do not overwrite the original backup on resume'")
    $global:Calls.Clear(); $global:FailAt = ''
    Run-Update $root
    Assert (-not (@($global:Calls | Where-Object { $_ -eq 'backup' }).Count)) 'Backup was repeated after possible migration.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $root '.update-state.json'))) 'Resume did not complete.'
    Write-Host 'PASS: interrupted migration/startup resumes the same release with its original recovery backup.'
} finally {
    Set-Location -LiteralPath $original
    Remove-Item Function:/docker, Function:/Invoke-RestMethod, Function:/Invoke-WebRequest -ErrorAction SilentlyContinue
    $resolved = [IO.Path]::GetFullPath($scratch)
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'infrascope-update-check-*') { throw 'Unexpected cleanup target.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
