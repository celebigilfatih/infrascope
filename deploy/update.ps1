# Online Windows update: verified release + mandatory encrypted backup + resumable apply.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $true)][string]$PassphraseFile,
    [string]$InstallationRoot = $PSScriptRoot,
    [string]$PublicIp = '',
    [string]$HttpsDirectory = '',
    [ValidateRange(0,65535)][int]$HttpsPort = 0,
    [ValidateRange(0,65535)][int]$LegacyPort = 0,
    [ValidateRange(0,65535)][int]$BackendPort = 0,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Repository = 'celebigilfatih/infrascope'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'release-common.ps1')
. (Join-Path $PSScriptRoot 'release-https.ps1')
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
    Assert-ReleaseDocker
    $package = Get-ReleasePackage $Version $Repository
    if ($journal -and $journal.releaseHash -cne $package.Hash) { throw 'Release changed since the interrupted update. Refusing to mix release contents.' }
    $compose = @(Get-ReleaseCompose $InstallationRoot)
    $configText = & docker @compose config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Current Compose configuration is invalid.' }
    $project = ($configText | ConvertFrom-Json).name
    if ($project -notmatch '^[a-z0-9][a-z0-9_-]*$' -or ($journal -and $journal.project -cne $project)) { throw 'The existing Docker project identity must remain unchanged.' }
    $ids = @(& docker @compose -p $project ps -aq app)
    if ($LASTEXITCODE -ne 0 -or -not $ids.Count) { throw 'The existing application container is missing; verify the installation project before updating.' }
    foreach ($id in $ids) {
        $info = @(Get-ReleaseDockerJson @('inspect',$id) 'application ownership')[0]
        if ((Get-ReleaseLabel $info.Config.Labels 'com.docker.compose.project') -cne $project -or
            (Get-ReleaseLabel $info.Config.Labels 'com.docker.compose.project.working_dir') -ine $InstallationRoot) { throw 'Application container belongs to another installation.' }
    }
    $https = Get-ReleaseHttpsContext -InstallationRoot $InstallationRoot -Project $project -PublicIp $PublicIp -HttpsDirectory $HttpsDirectory -HttpsPort $HttpsPort -LegacyPort $LegacyPort -BackendPort $BackendPort
    if (-not $journal -and $Version -ceq $current -and (Test-Path -LiteralPath (Join-Path $InstallationRoot 'release.json')) -and (-not $https -or ($https.Existing -and $https.RedirectComplete -and -not $https.NeedsSetup))) {
        Test-ReleasePayload $InstallationRoot $Version $Repository | Out-Null
        if ($https) { Enable-ReleaseHttps -Context $https -InstallationLock $lock -SourceRoot $package.Root | Out-Null }
        Write-Host "Version $Version is already installed. No application changes applied."
        return
    }
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
        $nonce = [Guid]::NewGuid().ToString('N')
        $targetText = [regex]::Replace([IO.File]::ReadAllText($envPath), '(?m)^VERSION=[^\r\n]*', "VERSION=$Version")
        $sha=[Security.Cryptography.SHA256]::Create()
        try { $targetHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($targetText)))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
        $journal = [pscustomobject]@{ schema = 2; version = $Version; previousVersion = $current; repository = $Repository;
            releaseHash = $package.Hash; backupName = ('infrascope-preupdate-'+$nonce); backup = ''; backupHash = '';
            project = $project; installationRoot = $InstallationRoot; recordDirectory = $recordDirectory; state = 'backup-pending';
            originalEnvHash = (Get-ReleaseHash $envPath); appliedEnvHash = $targetHash; secureEnvHash = '';
            enrollHttps = ([bool]($https -and -not $https.Existing)); secureBackupName = ('infrascope-secure-'+$nonce); secureBackup = ''; secureBackupHash = '' }
        Write-ReleaseJson $journalPath $journal
    }
    if ($journal.schema -ne 2 -or $journal.installationRoot -ine $InstallationRoot) { throw 'Unsupported or foreign update journal. Use the recovery runbook.' }
    if ($journal.state -ceq 'backup-pending') {
        if ((Get-ReleaseHash $envPath) -cne $journal.originalEnvHash) { throw 'Customer ENV changed before the recovery point completed. Resume refused.' }
        # A planned name is durable before encryption: a lost response re-authenticates the same bundle.
        $backup = & (Join-Path $package.Root 'backup.ps1') -InstallationRoot $InstallationRoot -ProjectName $project -RecoveryImage $package.Manifest.images.nms -HttpsContext $https -BackupName $journal.backupName -PassphraseFile $PassphraseFile -PassThru
        if ($null -eq $backup -or $backup -isnot [IO.FileInfo] -or -not $backup.Exists -or $backup.Length -le 0) { throw 'No completed encrypted recovery bundle was returned. Update stopped.' }
        $journal.backup = $backup.FullName; $journal.backupHash = Get-ReleaseHash $backup.FullName; $journal.state = 'backed-up'
        Write-ReleaseJson $journalPath $journal
    } else {
        if (-not (Test-Path -LiteralPath $journal.backup -PathType Leaf) -or (Get-ReleaseHash $journal.backup) -cne $journal.backupHash) { throw 'Original recovery bundle is missing or changed. Resume refused.' }
        $actual = Get-ReleaseHash $envPath
        $allowedHashes = @($journal.originalEnvHash,$journal.appliedEnvHash,$journal.secureEnvHash) | Where-Object { $_ }
        # The redirect helper journals its ENV transition before replacing the file.
        if ($https -and (Test-Path -LiteralPath (Join-Path $https.Root '.redirect-state.json'))) {
            $redirect = Get-Content -LiteralPath (Join-Path $https.Root '.redirect-state.json') -Raw | ConvertFrom-Json
            if ($redirect.PSObject.Properties.Name -contains 'beforeHash' -and $redirect.beforeHash -ceq $journal.appliedEnvHash) { $allowedHashes += $redirect.afterHash }
        }
        if ($actual -cnotin $allowedHashes) { throw 'Customer ENV changed during interrupted update. Resume refused.' }
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
    $journal.appliedEnvHash = Get-ReleaseHash $envPath
    Write-ReleaseJson $journalPath $journal
    $compose = @(Get-ReleaseCompose $InstallationRoot $project)
    Invoke-ReleaseDocker ($compose + @('config', '--quiet'))
    Invoke-ReleaseDocker ($compose + @('up', '-d', '--wait', '--wait-timeout', '300', '--pull', 'never'))
    if ($https) {
        $https = Enable-ReleaseHttps -Context $https -InstallationLock $lock -SourceRoot $package.Root
        $journal.secureEnvHash = Get-ReleaseHash $envPath
        Write-ReleaseJson $journalPath $journal
        if ($journal.enrollHttps) {
            if ($journal.secureBackup) {
                if (-not (Test-Path -LiteralPath $journal.secureBackup) -or (Get-ReleaseHash $journal.secureBackup) -cne $journal.secureBackupHash) { throw 'Initial secure recovery bundle changed or is missing.' }
            } else {
                $secureBackup = & (Join-Path $package.Root 'backup.ps1') -InstallationRoot $InstallationRoot -ProjectName $project -RecoveryImage $package.Manifest.images.nms -HttpsContext $https -BackupName $journal.secureBackupName -PassphraseFile $PassphraseFile -PassThru
                $journal.secureBackup=$secureBackup.FullName; $journal.secureBackupHash=Get-ReleaseHash $secureBackup.FullName
                Write-ReleaseJson $journalPath $journal
            }
        }
    }
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
