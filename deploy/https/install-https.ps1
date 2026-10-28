# Adds only a separate HTTPS proxy. Does not change the existing app or its environment.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$PublicIp,
    [string]$InstallationProject='infrascope-musteri',
    [string]$ProxyProject='infrascope-https',
    [ValidateRange(1,65535)][int]$HttpsPort=443,
    [string]$ConfigurationRoot=''
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $ConfigurationRoot){$ConfigurationRoot=$PSScriptRoot}
$parsedIp=$null
if (-not [Net.IPAddress]::TryParse($PublicIp,[ref]$parsedIp) -or $parsedIp.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsedIp.ToString() -cne $PublicIp -or $PublicIp -in @('0.0.0.0','255.255.255.255')) { throw 'Use a canonical IPv4 address assigned to this Windows server.' }
foreach ($name in @($InstallationProject,$ProxyProject)) { if ($name -cnotmatch '^[a-z0-9][a-z0-9_-]{0,62}$') { throw 'Invalid Docker project name.' } }
if ($InstallationProject -ceq $ProxyProject) { throw 'HTTPS must use a separate project.' }
$root=[IO.Path]::GetFullPath($ConfigurationRoot)
$lock=[IO.File]::Open((Join-Path $root '.setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
function Invoke-Docker([string[]]$Arguments) {
    & docker @Arguments | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed (exit $LASTEXITCODE). Existing application was not changed." }
}
function Save-State($State) {
    $temp=$statePath+'.tmp'
    [IO.File]::WriteAllText($temp,($State|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $statePath -Force
}
try {
    $engine=& docker info --format '{{.OSType}}/{{.Architecture}}'
    if ($LASTEXITCODE -ne 0 -or $engine -notin @('linux/x86_64','linux/amd64')) { throw 'Start Docker Desktop with Linux amd64 containers.' }
    $network=$InstallationProject+'_infrascope-net'
    $netText=& docker network inspect $network
    if ($LASTEXITCODE -ne 0) { throw 'Existing InfraScope network was not found.' }
    $net=@($netText|ConvertFrom-Json)[0]
    if ($net.Labels.'com.docker.compose.project' -cne $InstallationProject) { throw 'Existing network ownership differs.' }
    $appIds=@(& docker ps -q --filter "label=com.docker.compose.project=$InstallationProject" --filter 'label=com.docker.compose.service=app')
    if ($LASTEXITCODE -ne 0 -or $appIds.Count -ne 1) { throw 'Expected one running existing InfraScope app.' }
    $appInfo=@((& docker inspect $appIds[0])|ConvertFrom-Json)[0]
    if ($LASTEXITCODE -ne 0 -or $appInfo.State.Health.Status -cne 'healthy' -or $null -eq $appInfo.NetworkSettings.Networks.PSObject.Properties[$network]) { throw 'Existing app is not healthy on the expected network.' }
    $statePath=Join-Path $root '.https-state.json'
    $envPath=Join-Path $root '.env'
    $caPath=Join-Path $root 'infrascope-root-ca.crt'
    $configurationHash=(Get-FileHash -LiteralPath (Join-Path $root 'compose.yml')).Hash + ':' + (Get-FileHash -LiteralPath (Join-Path $root 'Caddyfile')).Hash
    $state=if(Test-Path -LiteralPath $statePath){Get-Content -LiteralPath $statePath -Raw|ConvertFrom-Json}else{$null}
    if ($state -and ($state.root -cne $root -or $state.ip -cne $PublicIp -or $state.port -ne $HttpsPort -or $state.project -cne $ProxyProject -or $state.network -cne $network -or $state.configHash -cne $configurationHash)) { throw 'Existing HTTPS installation differs. Refusing to replace its identity/configuration.' }
    $existing=@(& docker ps -aq --filter "label=com.docker.compose.project=$ProxyProject")
    foreach ($id in $existing) {
        $info=@((& docker inspect $id)|ConvertFrom-Json)[0]
        if (-not $state -or $info.Config.Labels.'io.infrascope.component' -cne 'https' -or $info.Config.Labels.'com.docker.compose.project.working_dir' -ine $root) { throw 'Another project already owns this HTTPS project name.' }
    }
    $volumes=@(& docker volume ls -q --filter ('name=^'+$ProxyProject+'_caddy_data$'))
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect HTTPS storage.' }
    if ($volumes.Count) {
        $volume=@((& docker volume inspect $volumes[0])|ConvertFrom-Json)[0]
        if (-not $state -or $volume.Labels.'com.docker.compose.project' -cne $ProxyProject -or $volume.Labels.'io.infrascope.component' -cne 'https') { throw 'Unrecognized existing CA storage. Refusing to reuse it.' }
    } elseif ($state -and $state.caHash) { throw 'Existing CA storage is missing. Restore it; do not silently generate a new CA.' }
    if (-not $existing.Count) {
        $probe=[Net.Sockets.TcpListener]::new($parsedIp,$HttpsPort)
        try { $probe.Start() } finally { $probe.Stop() }
    }
    $envText="PUBLIC_HOST=$PublicIp`nTLS_BIND_IP=$PublicIp`nHTTPS_PORT=$HttpsPort`nINFRASCOPE_NETWORK=$network`n"
    if (Test-Path -LiteralPath $envPath) {
        if ([IO.File]::ReadAllText($envPath).Replace("`r`n","`n") -cne $envText) { throw 'HTTPS settings file differs from requested settings.' }
    } else { [IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false)) }
    $compose=@('compose','--project-directory',$root,'--env-file',$envPath,'-f',(Join-Path $root 'compose.yml'),'-p',$ProxyProject)
    Invoke-Docker ($compose+@('config','--quiet'))
    if (-not $state) {
        $state=[pscustomobject]@{schema=1;root=$root;ip=$PublicIp;port=$HttpsPort;project=$ProxyProject;network=$network;configHash=$configurationHash;caHash='';status='starting'}
        Save-State $state
    }
    Invoke-Docker ($compose+@('pull'))
    Invoke-Docker ($compose+@('up','-d','--pull','never'))
    $ids=@(& docker @compose ps -q https)
    if ($LASTEXITCODE -ne 0 -or $ids.Count -ne 1) { throw 'HTTPS service did not start.' }
    $certificateReady=$false
    $export=Join-Path $root 'root-ca.export.tmp'
    for($attempt=0;$attempt -lt 30;$attempt++) {
        $prior=$ErrorActionPreference
        try { $ErrorActionPreference='Continue'; & docker cp ($ids[0]+':/data/caddy/pki/authorities/local/root.crt') $export 2>$null | Out-Null; $certificateReady=($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference=$prior }
        if($certificateReady){break}; Start-Sleep -Milliseconds 500
    }
    if(-not $certificateReady){throw 'Public CA certificate not ready. Rerun the same command; keep the HTTPS volume.'}
    $caHash=(Get-FileHash -LiteralPath $export -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($state.caHash -and $state.caHash -cne $caHash) { throw 'CA identity changed. Refusing to replace the trusted public certificate.' }
    if ((Test-Path -LiteralPath $caPath) -and (Get-FileHash -LiteralPath $caPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $caHash) { throw 'Existing exported CA certificate differs.' }
    Copy-Item -LiteralPath $export -Destination $caPath -Force
    Remove-Item -LiteralPath $export
    $state.caHash=$caHash; Save-State $state
    $url='https://'+$PublicIp+$(if($HttpsPort -eq 443){''}else{':'+$HttpsPort})
    $ready=$false
    for($attempt=0;$attempt -lt 10;$attempt++) {
        $prior=$ErrorActionPreference
        # The private Caddy CA has no public revocation endpoint. Schannel's
        # best-effort mode preserves chain/hostname checks and revoked-cert rejection.
        try { $ErrorActionPreference='Continue'; $payload=& curl.exe --noproxy '*' --cacert $caPath --ssl-revoke-best-effort --fail --silent --show-error --connect-timeout 5 --max-time 10 ($url+'/api/health/ready') 2>$null; $ok=($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference=$prior }
        if($ok){try{$health=$payload|ConvertFrom-Json; $ready=($health.status -ceq 'ready')}catch{}}
        if($ready){break}; Start-Sleep -Milliseconds 500
    }
    if(-not $ready){throw 'CA-verified HTTPS readiness failed. Inspect proxy logs; do not disable certificate verification.'}
    if ((& docker ps -q --filter "label=com.docker.compose.project=$InstallationProject" --filter 'label=com.docker.compose.service=app') -cne $appIds[0]) { throw 'Original application container changed during HTTPS setup.' }
    $state.status='ready'; Save-State $state
    Write-Host "HTTPS ready: $url (app version $($health.version))"
    Write-Host "Public CA certificate: $caPath"
    Write-Host "CA file SHA256: $caHash"
    Write-Host 'Copy only this public CRT to authorized client computers, verify its SHA256, then trust it in CurrentUser Root. Keep the Docker CA volume; never copy its private keys.'
} finally { $lock.Dispose() }
