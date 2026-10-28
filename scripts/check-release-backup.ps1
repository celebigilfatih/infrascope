# Actual backup orchestration; Docker encryption/dump I/O are explicit fixture boundaries.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-release-backup-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$original=(Get-Location).Path
$global:BackupFixtureRoot=$scratch
$global:BackupFixtureCalls=[Collections.Generic.List[string]]::new()
$global:BackupFixtureFail=''
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function global:docker {
    $call=$args -join ' ';$global:BackupFixtureCalls.Add($call);$global:LASTEXITCODE=0
    if($call -match 'config --format json'){return '{"name":"backup-fixture"}'}
    if($args[0] -eq 'ps'){return}
    if($call -match ' cp postgres:'){
        [IO.File]::WriteAllText([string]$args[-1],'synthetic database dump');return
    }
    if($args[0] -eq 'run' -and $call -match 'nms_service.recovery create'){
        if($global:BackupFixtureFail -eq 'create'){$global:LASTEXITCODE=9;return}
        $index=[Array]::IndexOf([object[]]$args,'--output')
        $name=Split-Path -Leaf ([string]$args[$index+1])
        [IO.File]::WriteAllText((Join-Path $global:BackupFixtureRoot ('backups/'+$name)),'synthetic authenticated bundle');return
    }
    if($args[0] -eq 'run' -and $call -match 'nms_service.recovery verify'){
        if($global:BackupFixtureFail -eq 'verify'){$global:LASTEXITCODE=10};return
    }
}
try {
    [IO.File]::WriteAllText((Join-Path $scratch '.env'),"COMPOSE_PROJECT_NAME=backup-fixture`nNEXTAUTH_SECRET=fixture-session-key`nINTEGRATION_CREDENTIALS_KEY=fixture-encryption-key`n")
    [IO.File]::WriteAllText((Join-Path $scratch 'docker-compose.yml'),'services: {}')
    $phrase=Join-Path $scratch 'phrase.txt';[IO.File]::WriteAllText($phrase,'fixture-private-recovery-passphrase')
    $image='sha256:'+('a'*64)
    $parameters=@{PassphraseFile=$phrase;InstallationRoot=$scratch;RecoveryImage=$image;ProjectName='backup-fixture';BackupName='infrascope-fixture-once';PassThru=$true}
    $first=& (Join-Path $source 'deploy/backup.ps1') @parameters
    Assert ($first -is [IO.FileInfo] -and $first.Exists) 'Candidate recovery image did not return a completed backup.'
    $again=& (Join-Path $source 'deploy/backup.ps1') @parameters
    Assert ($again.FullName -ceq $first.FullName) 'Repeat backup did not retain the original archive.'
    Assert (@($global:BackupFixtureCalls|Where-Object{$_ -match 'nms_service.recovery create'}).Count -eq 1) 'Repeat backup created another bundle.'
    Assert (@($global:BackupFixtureCalls|Where-Object{$_ -match 'nms_service.recovery verify'}).Count -eq 1) 'Existing bundle was not authenticated before reuse.'
    Assert (($global:BackupFixtureCalls -join "`n") -notmatch 'fixture-private-recovery-passphrase') 'Passphrase entered command arguments.'
    $global:BackupFixtureFail='verify';$rejected=$false
    try{& (Join-Path $source 'deploy/backup.ps1') @parameters|Out-Null}catch{$rejected=$true}
    Assert $rejected 'Failed backup authentication was accepted.'
    Assert ([IO.File]::ReadAllText($first.FullName) -ceq 'synthetic authenticated bundle') 'Failed retry replaced the original recovery archive.'
    $parameters.BackupName='infrascope-fixture-failure';$global:BackupFixtureFail='create';$rejected=$false
    try{& (Join-Path $source 'deploy/backup.ps1') @parameters|Out-Null}catch{$rejected=$true}
    Assert $rejected 'Failed encryption was reported as a completed backup.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $scratch 'backups/infrascope-fixture-failure.isbackup'))) 'Failed encryption published a recovery archive.'
    Write-Host 'PASS: candidate-image backup, authenticated idempotent reuse, rejected verification/encryption failures and passphrase argument exclusion.'
}finally{
    Set-Location -LiteralPath $original
    Remove-Item Function:/docker -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($scratch)
    if((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-release-backup-[a-f0-9]{32}$'){throw 'Unexpected backup fixture cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
