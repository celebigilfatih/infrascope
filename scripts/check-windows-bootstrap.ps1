# Real bootstrap/updater with synthetic GitHub transport and Docker boundaries.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$FixtureZip)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-bootstrap-check-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$original=(Get-Location).Path
$global:BootstrapFixture=(Resolve-Path -LiteralPath $FixtureZip).Path
$global:BootstrapVersion='1.0.10'
$global:BootstrapCalls=[Collections.Generic.List[string]]::new()
$global:BootstrapTamper=$false
$global:BootstrapDigest=(Get-FileHash -LiteralPath $global:BootstrapFixture).Hash.ToLowerInvariant()
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function global:Invoke-RestMethod {
    param($Uri,$Headers,$Method,$TimeoutSec)
    return [pscustomobject]@{tag_name=('v'+$global:BootstrapVersion);draft=$false;prerelease=$false;assets=@(
        [pscustomobject]@{name=('infrascope-windows-online-'+$global:BootstrapVersion+'.zip');digest=('sha256:'+$global:BootstrapDigest);url='https://api.github.com/repos/celebigilfatih/infrascope/releases/assets/123'})}
}
function global:Invoke-WebRequest {
    param($Uri,$Headers,$OutFile,[switch]$UseBasicParsing,$TimeoutSec)
    if($global:BootstrapTamper){[IO.File]::WriteAllText($OutFile,'tampered package')}
    else{Copy-Item -LiteralPath $global:BootstrapFixture -Destination $OutFile}
}
function global:docker {
    $arguments=@($args);$call=$arguments -join ' ';$global:BootstrapCalls.Add($call);$global:LASTEXITCODE=0
    if($call -like 'info --format*'){return 'linux/amd64'}
    if($call -match 'config --format json'){return '{"name":"bootstrap-fixture"}'}
    if($call -match 'image inspect.*Architecture'){return 'linux/amd64'}
    if($call -match 'ps -aq app'){return 'synthetic-app'}
    if($call -eq 'inspect synthetic-app'){return (@{Config=@{Labels=@{'com.docker.compose.project'='bootstrap-fixture';'com.docker.compose.project.working_dir'=(Get-Location).Path}}}|ConvertTo-Json -Depth 5)}
    if($call -match ' cp postgres:'){[IO.File]::WriteAllText($arguments[-1],'synthetic dump');return}
    if($call -match 'nms_service.recovery create'){
        $global:BootstrapCalls.Add('backup')
        $mount=$arguments[[Array]::IndexOf($arguments,'--volume')+1]
        [IO.File]::WriteAllText((Join-Path $mount.Substring(0,$mount.Length-10) (Split-Path -Leaf $arguments[-1])),'synthetic encrypted backup')
    }
}
function New-Installation([string]$Name){
    $root=Join-Path $scratch $Name;[IO.Directory]::CreateDirectory($root)|Out-Null
    [IO.File]::WriteAllText((Join-Path $root '.env'),"VERSION=1.0.9`nCOMPOSE_PROJECT_NAME=bootstrap-fixture`nAPP_PORT=18173`nCUSTOM_SETTING=keep-this`n",[Text.UTF8Encoding]::new($false))
    foreach($name in @('update.ps1','release-common.ps1')){[IO.File]::WriteAllText((Join-Path $root $name),"throw 'Old 1.0.9 updater must not execute'")}
    [IO.File]::WriteAllText((Join-Path $root 'docker-compose.yml'),'services: {}')
    [IO.File]::WriteAllText((Join-Path $root 'backup.ps1'),@'
param([string]$PassphraseFile,[switch]$PassThru)
$global:BootstrapCalls.Add('backup')
$path=Join-Path $PSScriptRoot 'backups/fixture.isbackup'
[IO.Directory]::CreateDirectory((Split-Path -Parent $path))|Out-Null
[IO.File]::WriteAllText($path,'synthetic encrypted backup')
if($PassThru){Get-Item -LiteralPath $path}
'@)
    return $root
}
try {
    $phrase=Join-Path $scratch 'recovery-passphrase.txt';[IO.File]::WriteAllText($phrase,'synthetic recovery passphrase')
    $root=New-Installation 'existing installation with spaces'
    $before=[IO.File]::ReadAllText((Join-Path $root '.env'))
    $global:BootstrapTamper=$true;$rejected=$false
    try{& (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.10 -Destination $root -Update -PassphraseFile $phrase -NoBrowser}catch{$rejected=$_.Exception.Message -match 'checksum mismatch'}
    Assert $rejected 'Tampered update was not rejected before execution.'
    Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $before) 'Rejected bootstrap changed ENV.'
    Assert ($global:BootstrapCalls.Count -eq 0) 'Rejected bootstrap reached Docker/backup.'
    $global:BootstrapTamper=$false
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $validFixture=$global:BootstrapFixture
    foreach($entryName in @('infrascope/../escaped.txt','infrascope/install.ps1')){
        $badZip=Join-Path $scratch ([Guid]::NewGuid().ToString('N')+'.zip')
        Copy-Item -LiteralPath $validFixture -Destination $badZip
        $archive=[IO.Compression.ZipFile]::Open($badZip,[IO.Compression.ZipArchiveMode]::Update)
        try{$writer=[IO.StreamWriter]::new($archive.CreateEntry($entryName).Open());try{$writer.Write('unexpected payload')}finally{$writer.Dispose()}}finally{$archive.Dispose()}
        $global:BootstrapFixture=$badZip
        $global:BootstrapDigest=(Get-FileHash -LiteralPath $badZip).Hash.ToLowerInvariant()
        $rejected=$false
        try{& (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.10 -Destination $root -Update -PassphraseFile $phrase -NoBrowser}catch{$rejected=$_.Exception.Message -match 'Unexpected files|Unsafe or unexpected'}
        Assert $rejected "Unsafe/duplicate ZIP entry was accepted: $entryName"
        Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $before) 'Rejected ZIP changed customer ENV.'
        Assert ($global:BootstrapCalls.Count -eq 0) 'Unsafe ZIP reached Docker/backup.'
    }
    $global:BootstrapFixture=$validFixture
    $global:BootstrapDigest=(Get-FileHash -LiteralPath $validFixture).Hash.ToLowerInvariant()
    & (Join-Path $source 'deploy/install-infrascope.ps1') -Version 1.0.10 -Destination $root -Update -PassphraseFile $phrase -NoBrowser
    Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $before.Replace('VERSION=1.0.9','VERSION=1.0.10')) 'Bootstrap did not preserve customer ENV.'
    Assert (Test-Path -LiteralPath (Join-Path $root 'https/compose.yml')) 'Nested HTTPS payload missing.'
    Assert (@($global:BootstrapCalls|Where-Object{$_ -eq 'backup'}).Count -eq 1) 'Mandatory backup was not performed exactly once.'
    Assert (-not (Test-Path -LiteralPath (Join-Path $root '.update-state.json'))) 'Successful bootstrap left an interrupted update journal.'
    Write-Host 'PASS: verified bootstrap upgrades existing1.0.9 using candidate updater, preserves settings and rejects tampering before writes.'
} finally {
    Set-Location -LiteralPath $original
    Remove-Item Function:/docker,Function:/Invoke-RestMethod,Function:/Invoke-WebRequest -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($scratch)
    if((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-bootstrap-check-[a-f0-9]{32}$'){throw 'Unexpected fixture cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
