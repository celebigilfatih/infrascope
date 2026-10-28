# Cross-version redirect journals are rejected before app deployment; owned retries remain resumable.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent $PSScriptRoot
. (Join-Path $source 'deploy/release-common.ps1')
. (Join-Path $source 'deploy/release-https.ps1')
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-transition-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
try{
    $context=[pscustomobject]@{Root=$scratch;InstallationRoot=$scratch;InstallationProject='fixture'}
    $manifest=[pscustomobject]@{version='1.0.10';images=[pscustomobject]@{app=('ghcr.io/celebigilfatih/infrascope-customer@sha256:'+('1'*64))};files=[pscustomobject]@{'docker-compose.yml'=('2'*64);'release-images.yml'=('3'*64)}}
    $redirect=[pscustomobject]@{schema=1;status='planned';image='old-image';beforeHash=('4'*64);files=@((Join-Path $scratch 'docker-compose.yml'),(Join-Path $scratch 'release-images.yml'));filesHash=(('2'*64)+':'+('3'*64))}
    $journal=[pscustomobject]@{schema=2;state='applying';version='1.0.10';installationRoot=$scratch;project='fixture';appliedEnvHash=('4'*64)}
    foreach($state in @('planned','rolled-back','switching')){
        $redirect.status=$state
        Write-ReleaseJson (Join-Path $scratch '.redirect-state.json') $redirect
        $rejected=$false
        try{Assert-ReleaseHttpsUpdateReady -Context $context -UpdateJournal $null -Manifest $manifest}catch{$rejected=$_.Exception.Message -match 'original HTTP redirect'}
        Assert $rejected ('Older '+$state+' redirect was not rejected before deployment.')
        $redirect.image=$manifest.images.app
        Write-ReleaseJson (Join-Path $scratch '.redirect-state.json') $redirect
        Assert-ReleaseHttpsUpdateReady -Context $context -UpdateJournal $journal -Manifest $manifest
        $redirect.image='old-image'
    }
    $redirect.image=$manifest.images.app
    foreach($field in @('image','beforeHash','filesHash')){
        $before=$redirect.$field;$redirect.$field='mismatch'
        Write-ReleaseJson (Join-Path $scratch '.redirect-state.json') $redirect
        $rejected=$false
        try{Assert-ReleaseHttpsUpdateReady -Context $context -UpdateJournal $journal -Manifest $manifest}catch{$rejected=$_.Exception.Message -match 'original HTTP redirect'}
        Assert $rejected ('Foreign redirect '+$field+' was accepted as an owned retry.')
        $redirect.$field=$before
    }
    $redirect.status='complete';$redirect.image='old-image'
    Write-ReleaseJson (Join-Path $scratch '.redirect-state.json') $redirect
    Assert-ReleaseHttpsUpdateReady -Context $context -UpdateJournal $null -Manifest $manifest
    $updater=[IO.File]::ReadAllText((Join-Path $source 'deploy/update.ps1'))
    Assert ($updater.IndexOf('Assert-ReleaseHttpsUpdateReady') -lt $updater.IndexOf("'stop', 'app', 'nms'")) 'Transition preflight is after app stop.'
    Assert ($updater -notmatch '\$journal\.appliedEnvHash\s*=\s*Get-ReleaseHash') 'Retry replaces the original planned ENV hash.'
    Write-Host 'PASS: old planned/rolled-back/switching redirects fail before deployment, exact owned target retries remain allowed and planned ENV hash is immutable.'
}finally{
    $resolved=[IO.Path]::GetFullPath($scratch)
    if((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-transition-[a-f0-9]{32}$'){throw 'Unexpected transition test cleanup path.'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
