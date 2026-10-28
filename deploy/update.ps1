# Online Windows update: verified release + mandatory encrypted backup + resumable apply.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$PassphraseFile,
    [string]$InstallationRoot = $PSScriptRoot,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Repository = 'celebigilfatih/infrascope'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'release-common.ps1')
$InstallationRoot = (Resolve-Path -LiteralPath $InstallationRoot).Path
$lock = Enter-ReleaseLock $InstallationRoot
$package = $null
$originalLocation = (Get-Location).Path
try {
    $PassphraseFile = (Resolve-Path -LiteralPath $PassphraseFile).Path
    Set-Location -LiteralPath $InstallationRoot
    $envPath = Join-Path $InstallationRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw 'No existing installation. Run install-infrascope.ps1 for a new installation.' }
    if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { throw 'Use an explicit stable release version.' }
    $current = Get-ReleaseSetting $envPath 'VERSION'
    if ($current -notmatch '^\d+\.\d+\.\d+$' -or [version]$Version -lt [version]$current) { throw 'Downgrades are not supported. Restore a compatible backup using the recovery runbook.' }
    $journalPath = Join-Path $InstallationRoot '.update-state.json'
    $journal = if (Test-Path -LiteralPath $journalPath) { Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json } else { $null }
    if ($journal -and ($journal.version -cne $Version -or $journal.repository -cne $Repository)) { throw "An interrupted update to $($journal.version) must be resumed first with the same repository/version." }
    if (-not $journal -and $Version -ceq $current -and (Test-Path -LiteralPath (Join-Path $InstallationRoot 'release.json'))) {
        Test-ReleasePayload $InstallationRoot $Version $Repository | Out-Null
        Write-Host "Version $Version is already installed. No changes applied."
        return
    }
    Assert-ReleaseDocker
    $package = Get-ReleasePackage $Version $Repository
    if ($journal -and $journal.releaseHash -cne $package.Hash) { throw 'Release changed since the interrupted update. Refusing to mix release contents.' }
    $compose = @(Get-ReleaseCompose $InstallationRoot)
    $configText = & docker @compose config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Current Compose configuration is invalid.' }
    $project = ($configText | ConvertFrom-Json).name
    if ($project -notmatch '^[a-z0-9][a-z0-9_-]*$' -or ($journal -and $journal.project -cne $project)) { throw 'The existing Docker project identity must remain unchanged.' }
    # Validate the candidate against the customer's existing settings before touching services/files.
    $candidate = @('compose', '--project-directory', $InstallationRoot, '--env-file', $envPath,
        '-f', (Join-Path $package.Root 'docker-compose.yml'), '-f', (Join-Path $package.Root 'release-images.yml'), '-p', $project)
    Invoke-ReleaseDocker ($candidate + @('config', '--quiet'))
    foreach ($reference in @($package.Manifest.images.app, $package.Manifest.images.nms, $package.Manifest.images.postgres)) {
        Invoke-ReleaseDocker @('pull', '--platform', 'linux/amd64', $reference)
        $platform = & docker image inspect $reference --format '{{.Os}}/{{.Architecture}}'
        if ($LASTEXITCODE -ne 0 -or $platform -ne 'linux/amd64') { throw 'Release image platform verification failed.' }
    }
    if (-not $journal) {
        # backup.ps1 must return a completed encrypted bundle; failure prevents all deployment mutations.
        $backup = & (Join-Path $InstallationRoot 'backup.ps1') -PassphraseFile $PassphraseFile -PassThru
        if ($null -eq $backup -or $backup -isnot [IO.FileInfo] -or -not $backup.Exists -or $backup.Length -le 0) { throw 'No completed encrypted recovery bundle was returned. Update stopped.' }
        $recordDirectory = Join-Path $InstallationRoot ('backups/updates/' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
        [IO.Directory]::CreateDirectory($recordDirectory) | Out-Null
        foreach ($name in @($script:ReleaseFiles + 'release.json')) {
            $previous = Join-Path $InstallationRoot $name
            if (Test-Path -LiteralPath $previous -PathType Leaf) {
                $record = Join-Path $recordDirectory $name
                [IO.Directory]::CreateDirectory((Split-Path -Parent $record)) | Out-Null
                Copy-Item -LiteralPath $previous -Destination $record
            }
        }
        $journal = [pscustomobject]@{ schema = 1; version = $Version; previousVersion = $current; repository = $Repository;
            releaseHash = $package.Hash; backup = $backup.FullName; backupHash = (Get-ReleaseHash $backup.FullName);
            project = $project; recordDirectory = $recordDirectory; state = 'backed-up' }
        Write-ReleaseJson $journalPath $journal
    } else {
        if (-not (Test-Path -LiteralPath $journal.backup -PathType Leaf) -or (Get-ReleaseHash $journal.backup) -cne $journal.backupHash) { throw 'Original recovery bundle is missing or changed. Resume refused.' }
        Write-Host "Resuming $Version using the original recovery bundle."
    }
    Invoke-ReleaseDocker ($compose + @('-p', $project, 'stop', 'app', 'nms'))
    $journal.state = 'applying'
    Write-ReleaseJson $journalPath $journal
    # Never replace customer .env, identity, license cache, certificates, backups or database volumes.
    foreach ($name in @($script:ReleaseFiles + 'release.json')) {
        $destination = Join-Path $InstallationRoot $name
        [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        Copy-Item -LiteralPath (Join-Path $package.Root $name) -Destination $destination -Force
    }
    Set-ReleaseVersion $envPath $Version
    $compose = @(Get-ReleaseCompose $InstallationRoot $project)
    Invoke-ReleaseDocker ($compose + @('config', '--quiet'))
    Invoke-ReleaseDocker ($compose + @('up', '-d', '--wait', '--wait-timeout', '300', '--pull', 'never'))
    $journal.state = 'complete'
    Write-ReleaseJson (Join-Path $journal.recordDirectory 'completed.json') $journal
    Remove-Item -LiteralPath $journalPath
    Write-Host "Update complete: $($journal.previousVersion) -> $Version. All Compose health checks passed."
    Write-Host "Recovery bundle: $($journal.backup). Keep its passphrase separately and copy the bundle to independent storage."
} catch {
    Write-Warning 'Update did not complete. Customer data/keys were not deleted. If .update-state.json exists, rerun the same version after correcting the error. Do not downgrade images after a migration; use the recovery runbook if restoration is required.'
    throw
} finally {
    Set-Location -LiteralPath $originalLocation
    if ($package) { Remove-ReleaseStage $package.Stage }
    $lock.Dispose()
}
