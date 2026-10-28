# Transport boundary for an unpublished ZIP. Docker, installers and all deployment effects remain real.
[CmdletBinding()]
param([string]$FixtureZip,[string]$Version,[string]$Destination,[string]$PassphraseFile,
    [string]$PublicIp='',[int]$HttpsPort=0,[int]$AppPort=8170,[int]$BackendPort=0,
    [string]$ProjectName='infrascope',[switch]$Update,[switch]$InterruptAfterReady,[switch]$InterruptAfterTlsStart,
    [switch]$RedirectOnly,[string]$HttpsDirectory='',[ValidateSet('Apply','Rollback')][string]$RedirectAction='Apply',
    [switch]$FailRedirectPull,[switch]$KillAfterBackend)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if([IO.Path]::GetFullPath($Destination) -notmatch '[\\/]infrascope-release-https-[^\\/]+[\\/][a-z-]+[\\/]infrascope$'){throw 'Fault injection is restricted to this rehearsal owned temporary installation.'}
$global:FixtureZip=if($RedirectOnly){''}else{(Resolve-Path -LiteralPath $FixtureZip).Path}
$global:FixtureVersion=$Version
$global:FixtureDocker=(Get-Command docker -CommandType Application|Select-Object -First 1).Source
$global:FixtureInterrupt=[bool]$InterruptAfterReady
$global:FixtureInterruptTls=[bool]$InterruptAfterTlsStart
$global:FixtureFailRedirectPull=[bool]$FailRedirectPull
$global:FixtureKillAfterBackend=[bool]$KillAfterBackend
function global:Invoke-RestMethod {
    param($Uri,$Headers,$Method,$TimeoutSec)
    return [pscustomobject]@{tag_name=('v'+$global:FixtureVersion);draft=$false;prerelease=$false;assets=@(
        [pscustomobject]@{name=('infrascope-windows-online-'+$global:FixtureVersion+'.zip');digest=('sha256:'+(Get-FileHash -LiteralPath $global:FixtureZip).Hash.ToLowerInvariant());url='https://api.github.com/repos/celebigilfatih/infrascope/releases/assets/123'})}
}
function global:Invoke-WebRequest {
    param($Uri,$Headers,$OutFile,[switch]$UseBasicParsing,$TimeoutSec)
    Copy-Item -LiteralPath $global:FixtureZip -Destination $OutFile
}
function global:docker {
    $arguments=@($args);$data=@($input)
    if($global:FixtureFailRedirectPull -and ($arguments -join ' ') -match '-p [a-z0-9_-]+-https-redirect pull$'){$global:LASTEXITCODE=27;return}
    if($data.Count){$data|& $global:FixtureDocker @arguments}else{& $global:FixtureDocker @arguments}
    $global:LASTEXITCODE=$LASTEXITCODE
    if($LASTEXITCODE -ne 0){return}
    if($global:FixtureKillAfterBackend -and ($arguments -join ' ') -match 'up -d --no-deps --pull never --wait'){
        # Terminate only this disposable QA child after the actual ENV/backend
        # transition, simulating process loss that cannot run catch/finally.
        [Diagnostics.Process]::GetCurrentProcess().Kill()
    }
    if($global:FixtureInterruptTls -and ($arguments -join ' ') -match '-p [a-z0-9_-]+-https up -d'){
        $global:FixtureInterruptTls=$false
        throw 'Synthetic connection interruption after real TLS proxy creation.'
    }
    if($global:FixtureInterrupt -and ($arguments -join ' ') -match 'up -d --wait --wait-timeout 300 --pull never'){
        $global:FixtureInterrupt=$false
        throw 'Synthetic connection interruption after real application readiness.'
    }
}
try {
    if($RedirectOnly){
        & (Join-Path $HttpsDirectory 'install-redirect.ps1') -PublicIp $PublicIp -InstallationRoot $Destination -InstallationProject $ProjectName -ProxyProject ($ProjectName+'-https') -LegacyPort $AppPort -BackendPort $BackendPort -ConfigurationRoot $HttpsDirectory -Action $RedirectAction
        return
    }
    $options=@{Version=$Version;Destination=$Destination;PassphraseFile=$PassphraseFile;PublicIp=$PublicIp;NoBrowser=$true;Update=$Update}
    if($Update){if($AppPort -ne 8170){$options.LegacyPort=$AppPort}}else{$options.AppPort=$AppPort;$options.ProjectName=$ProjectName}
    if($HttpsPort){$options.HttpsPort=$HttpsPort};if($BackendPort){$options.BackendPort=$BackendPort}
    & (Join-Path $source 'deploy/install-infrascope.ps1') @options
}finally{Remove-Item Function:/docker,Function:/Invoke-RestMethod,Function:/Invoke-WebRequest -ErrorAction SilentlyContinue}
