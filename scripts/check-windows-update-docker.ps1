# Isolated integration rehearsal using already-built production images.
# GitHub transport and pull are fixtures; Compose, PostgreSQL, migrations, encryption and readiness are real.
[CmdletBinding()]
param([string]$ImageVersion = '1.0.3')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Split-Path -Parent $PSScriptRoot
$python = (Get-Command python -CommandType Application | Select-Object -First 1).Source
$dockerBinary = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
$scratch = Join-Path $source ('tmp/windows-online-docker-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
$project = 'infrascope-update-check-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$original = (Get-Location).Path
$port = 18279
function Check([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Real-Docker {
    & $script:dockerBinary @args
    if ($LASTEXITCODE -ne 0) { throw "Integration Docker command failed ($LASTEXITCODE)." }
}
$digests = @{}
foreach ($pair in @(@('app', "ghcr.io/celebigilfatih/infrascope-customer:$ImageVersion"), @('nms', "ghcr.io/celebigilfatih/infrascope-customer-nms:$ImageVersion"), @('postgres', 'postgres:16-alpine'))) {
    $reference = Real-Docker image inspect $pair[1] --format '{{index .RepoDigests 0}}'
    $digests[$pair[0]] = $reference.Split('@')[1]
}
function New-Package([string]$Version) {
    & $script:python (Join-Path $source 'scripts/package-online-release.py') --version $Version --repository celebigilfatih/infrascope --revision aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app-digest $digests.app --nms-digest $digests.nms --postgres-digest $digests.postgres --output (Join-Path $scratch $Version) | Out-Host
    Check ($LASTEXITCODE -eq 0) 'Cannot build integration fixture.'
    return (Join-Path $scratch "$Version/infrascope-windows-online-$Version.zip")
}
$first = New-Package '1.0.1'
$global:RealUpdateFixture = New-Package '1.0.2'
$root = Join-Path $scratch 'installation with spaces/infrascope'
Expand-Archive -LiteralPath $first -DestinationPath (Split-Path -Parent $root)
$passphrasePath = Join-Path $scratch 'recovery-passphrase.txt'
[IO.File]::WriteAllText($passphrasePath, 'isolated-integration-recovery-passphrase', [Text.UTF8Encoding]::new($false))
function global:Invoke-RestMethod {
    param($Uri, $Headers, $Method, $TimeoutSec)
    return [pscustomobject]@{ tag_name = 'v1.0.2'; draft = $false; prerelease = $false; assets = @(
        [pscustomobject]@{ name = 'infrascope-windows-online-1.0.2.zip'; digest = ('sha256:' + (Get-FileHash -LiteralPath $global:RealUpdateFixture -Algorithm SHA256).Hash.ToLowerInvariant());
            url = 'https://api.github.com/repos/celebigilfatih/infrascope/releases/assets/123' }) }
}
function global:Invoke-WebRequest {
    param($Uri, $Headers, $OutFile, [switch]$UseBasicParsing, $TimeoutSec)
    Copy-Item -LiteralPath $global:RealUpdateFixture -Destination $OutFile
}
$global:IntegrationDockerBinary = $dockerBinary
function global:docker {
    if ($args[0] -eq 'pull') {
        # No remote 1.0.2 exists: assert the exact immutable local fixture is present, never retag it.
        & $global:IntegrationDockerBinary image inspect $args[-1] --format '{{.Id}}' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Local production image fixture missing.' }
        return
    }
    $pipelineInput = @($input)
    if ($pipelineInput.Count) { $pipelineInput | & $global:IntegrationDockerBinary @args }
    else { & $global:IntegrationDockerBinary @args }
    $global:LASTEXITCODE = $LASTEXITCODE
}
$compose = @('compose', '--project-directory', $root, '--env-file', (Join-Path $root '.env'), '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'release-images.yml'), '-p', $project)
try {
    & (Join-Path $root 'install.ps1') -NoBrowser -ProjectName $project -AppPort $port
    $initialEnv = [IO.File]::ReadAllText((Join-Path $root '.env'))
    $identityPath = Join-Path $root 'data/machine-id/machine-id'
    $identity = [IO.File]::ReadAllText($identityPath)
    $sql = "CREATE TABLE customer_update_fixture (id integer PRIMARY KEY, note text NOT NULL); INSERT INTO customer_update_fixture VALUES (1, 'persistent customer data');"
    Real-Docker @compose exec -T postgres psql -U infrascope -d infrascope -v ON_ERROR_STOP=1 -c $sql | Out-Host
    & (Join-Path $root 'update.ps1') -Version 1.0.2 -PassphraseFile $passphrasePath
    Check ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $initialEnv.Replace('VERSION=1.0.1', 'VERSION=1.0.2')) 'ENV settings/keys changed.'
    Check ([IO.File]::ReadAllText($identityPath) -ceq $identity) 'License identity changed.'
    $value = Real-Docker @compose exec -T postgres psql -U infrascope -d infrascope -At -c 'SELECT note FROM customer_update_fixture WHERE id=1'
    Check ($value -eq 'persistent customer data') 'Customer data lost.'
    $bundles = @(Get-ChildItem -LiteralPath (Join-Path $root 'backups') -Filter '*.isbackup')
    Check ($bundles.Count -eq 1) 'Expected exactly one pre-update encrypted backup.'
    $passphrase = [IO.File]::ReadAllText($passphrasePath)
    $passphrase | & $dockerBinary @compose exec -T nms python -m nms_service.recovery extract --input "/recovery/$($bundles[0].Name)" --directory /recovery/verified-recovery
    Check ($LASTEXITCODE -eq 0) 'Cannot authenticate/extract the recovery bundle.'
    Check ([IO.File]::ReadAllText((Join-Path $root 'backups/verified-recovery/environment.env')) -ceq $initialEnv) 'Backup did not preserve the original ENV.'
    # A separate temporary DB proves the pre-update dump contains the customer record.
    Real-Docker @compose cp (Join-Path $root 'backups/verified-recovery/database.dump') postgres:/tmp/update-restore.dump | Out-Host
    Real-Docker @compose exec -T postgres createdb -U infrascope update_restore_fixture
    Real-Docker @compose exec -T postgres pg_restore --no-owner --no-acl -U infrascope -d update_restore_fixture /tmp/update-restore.dump
    $restored = Real-Docker @compose exec -T postgres psql -U infrascope -d update_restore_fixture -At -c 'SELECT note FROM customer_update_fixture WHERE id=1'
    Check ($restored -eq 'persistent customer data') 'Pre-update backup failed restoration verification.'
    $ready = & $dockerBinary @compose exec -T app curl -fsS http://localhost:3000/api/health/ready
    Check ($LASTEXITCODE -eq 0) 'Updated production app not ready.'
    & (Join-Path $root 'update.ps1') -Version 1.0.2 -PassphraseFile $passphrasePath
    Check (@(Get-ChildItem -LiteralPath (Join-Path $root 'backups') -Filter '*.isbackup').Count -eq 1) 'Same-version retry created another backup.'
    Write-Host 'PASS: real Windows/Docker installation + update + readiness, original keys/identity/data, encrypted backup authentication and DB restoration; same-version retry is a no-op.'
} finally {
    Set-Location -LiteralPath $original
    Remove-Item Function:/docker, Function:/Invoke-RestMethod, Function:/Invoke-WebRequest -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath (Join-Path $root '.env')) {
        # Only the randomly named project created above is removed, including its synthetic DB volumes.
        & $dockerBinary @compose down --volumes --remove-orphans | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Test cleanup failed for project $project; inspect it before deleting the scratch directory." }
    }
    $resolved = [IO.Path]::GetFullPath($scratch)
    if ((Split-Path -Parent $resolved) -ne (Join-Path $source 'tmp') -or (Split-Path -Leaf $resolved) -notmatch '^windows-online-docker-[a-f0-9]{32}$') { throw 'Unexpected integration cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
