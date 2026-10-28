# Read-only HTTPS discovery and lock/preflight contracts; synthetic state only.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent $PSScriptRoot
. (Join-Path $source 'deploy/release-common.ps1')
. (Join-Path $source 'deploy/release-https.ps1')
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-https-context-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$root=Join-Path $scratch 'installation';[IO.Directory]::CreateDirectory($root)|Out-Null
$tlsRoot=Join-Path $scratch 'external HTTPS';[IO.Directory]::CreateDirectory($tlsRoot)|Out-Null
$global:ContextProxyPresent=$false
$global:ContextVolumePresent=$true
$global:ContextWrites=[Collections.Generic.List[string]]::new()
$global:ContextUrl='https://127.0.0.1:18443'
$global:ContextWrongRedirect=$false
$global:ContextExportDirectory=''
$global:ContextExportCaHash=''
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function global:docker {
    $global:LASTEXITCODE=0
    if($args[0] -eq 'ps'){if($global:ContextProxyPresent){return 'fixture-proxy'};return}
    if($args[0] -eq 'inspect'){return ($global:ContextProxy|ConvertTo-Json -Depth 10)}
    if($args[0] -eq 'volume' -and $args[1] -eq 'inspect'){
        if(-not $global:ContextVolumePresent){$global:LASTEXITCODE=1;return}
        return (@{Name='fixture-https_caddy_data';Labels=@{'com.docker.compose.project'='fixture-https';'io.infrascope.component'='https'}}|ConvertTo-Json -Depth 5)
    }
    if($args[0] -eq 'compose' -and ($args -join ' ') -match 'config --format json'){return '{"services":{"https":{"image":"caddy@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f"}}}'}
    if($args[0] -eq 'run' -and $global:ContextExportDirectory){
        [IO.File]::WriteAllText((Join-Path $global:ContextExportDirectory 'https-recovery.tar'),'synthetic private CA archive')
        return ($global:ContextExportCaHash+'  -')
    }
    $global:ContextWrites.Add(($args -join ' '));throw 'Unexpected mutation during discovery'
}
function global:curl.exe {
    $global:LASTEXITCODE=0
    if($args[-1] -like 'https://*'){return '{"status":"ready"}'}
    $target=if($global:ContextWrongRedirect){'https://invalid.example'}else{$global:ContextUrl}
    return @('HTTP/1.1 308 Permanent Redirect',('Location: '+$target+'/login?next=%2Fdashboard'))
}
try {
    [IO.File]::WriteAllText((Join-Path $root '.env'),"APP_PORT=8170`nCOMPOSE_PROJECT_NAME=fixture`n")
    Assert ($null -eq (Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture)) 'Legacy local-only context should remain unchanged without enrollment parameters.'
    foreach($name in @('compose.yml','Caddyfile','redirect-compose.yml','Redirectfile')){Copy-Item -LiteralPath (Join-Path $source "deploy/https/$name") -Destination $tlsRoot}
    $ca=Join-Path $tlsRoot 'infrascope-root-ca.crt';[IO.File]::WriteAllText($ca,'synthetic public CA')
    $state=[pscustomobject]@{schema=1;root=$tlsRoot;ip='127.0.0.1';port=18443;project='fixture-https';network='fixture_infrascope-net';status='ready';caHash=(Get-ReleaseHash $ca);configHash=((Get-FileHash (Join-Path $tlsRoot 'compose.yml')).Hash+':'+(Get-FileHash (Join-Path $tlsRoot 'Caddyfile')).Hash)}
    Write-ReleaseJson (Join-Path $tlsRoot '.https-state.json') $state
    $global:ContextProxy=@{Config=@{Labels=@{'io.infrascope.component'='https';'com.docker.compose.project'='fixture-https';'com.docker.compose.project.working_dir'=$tlsRoot}};Mounts=@(@{Type='volume';Name='fixture-https_caddy_data';Destination='/data'})}
    $global:ContextProxyPresent=$true
    $context=Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture
    Assert ($context.Existing -and $context.Root -ceq $tlsRoot -and $context.HttpsPort -eq 18443) 'Existing external HTTPS was not discovered/preserved.'
    Assert ($context.CaHash -ceq $state.caHash -and $context.VolumeName -ceq 'fixture-https_caddy_data') 'Existing CA identity changed.'
    $rejected=$false
    try{Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture -PublicIp 192.0.2.10|Out-Null}catch{$rejected=$_.Exception.Message -match 'IP|address'}
    Assert $rejected 'An existing HTTPS address was silently changed.'
    $global:ContextVolumePresent=$false;$rejected=$false
    try{Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture|Out-Null}catch{$rejected=$_.Exception.Message -match 'CA|storage|volume'}
    Assert $rejected 'Missing CA volume could silently generate another CA.'
    $global:ContextVolumePresent=$true
    [IO.File]::AppendAllText($ca,'changed');$rejected=$false
    try{Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture|Out-Null}catch{$rejected=$_.Exception.Message -match 'CA|certificate'}
    Assert $rejected 'Changed public CA certificate was accepted.'
    Assert ($global:ContextWrites.Count -eq 0) 'Read-only validation mutated Docker resources.'
    [IO.File]::WriteAllText($ca,'synthetic public CA')
    $redirectState=[pscustomobject]@{schema=1;root=$tlsRoot;installation=$root;project='fixture';caHash=$state.caHash;legacyPort=8170;backendPort=18170;status='complete';redirectProject='fixture-https-redirect';target=$global:ContextUrl;configHash=((Get-ReleaseHash (Join-Path $tlsRoot 'Redirectfile'))+':'+(Get-ReleaseHash (Join-Path $tlsRoot 'redirect-compose.yml')))}
    Write-ReleaseJson (Join-Path $tlsRoot '.redirect-state.json') $redirectState
    $redirectState.target='https://invalid.example';Write-ReleaseJson (Join-Path $tlsRoot '.redirect-state.json') $redirectState
    $rejected=$false
    try{Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture|Out-Null}catch{$rejected=$_.Exception.Message -match 'destination'}
    Assert $rejected 'Changed saved redirect destination was accepted.'
    $redirectState.target=$global:ContextUrl;Write-ReleaseJson (Join-Path $tlsRoot '.redirect-state.json') $redirectState
    $redirectFile=Join-Path $tlsRoot 'Redirectfile';$redirectBefore=[IO.File]::ReadAllText($redirectFile)
    [IO.File]::AppendAllText($redirectFile,'changed')
    $rejected=$false
    try{Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture|Out-Null}catch{$rejected=$_.Exception.Message -match 'configuration'}
    Assert $rejected 'Changed redirect configuration was accepted.'
    [IO.File]::WriteAllText($redirectFile,$redirectBefore,[Text.UTF8Encoding]::new($false))
    $context=Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture
    $before=[IO.File]::ReadAllText((Join-Path $root '.env'))
    $historical=Join-Path $root '.http-redirect.env.before'
    [IO.File]::WriteAllText($historical,$before)
    if($env:OS -eq 'Windows_NT'){
        Assert (-not (Get-Acl -LiteralPath $historical).AreAccessRulesProtected) 'Historical ACL fixture is already protected.'
        Get-ReleaseHttpsContext -InstallationRoot $root -Project fixture|Out-Null
        Assert (-not (Get-Acl -LiteralPath $historical).AreAccessRulesProtected) 'Discovery changed historical permissions.'
    }
    $lock=Enter-ReleaseLock $root
    try{
        Assert (Test-ReleaseInstallationLock -InstallationRoot $root -InstallationLock $lock) 'The held installation lock was not accepted.'
        $enabled=Enable-ReleaseHttps -Context $context -InstallationLock $lock -SourceRoot (Join-Path $source 'deploy')
        Assert ($enabled.CaHash -ceq $state.caHash) 'Completed external HTTPS was replaced.'
        Assert ([IO.File]::ReadAllText((Join-Path $root '.env')) -ceq $before) 'Completed external HTTPS changed customer ENV.'
        if($env:OS -eq 'Windows_NT'){
            Assert (Get-Acl -LiteralPath $historical).AreAccessRulesProtected 'Healthy-proxy upgrade left historical plaintext ENV permissions inherited.'
            Assert (Get-Acl -LiteralPath (Join-Path $root '.env')).AreAccessRulesProtected 'Healthy-proxy upgrade left ENV permissions inherited.'
        }
        Assert ($global:ContextWrites.Count -eq 0) 'Healthy completed proxies were unnecessarily changed.'
        $global:ContextExportDirectory=Join-Path $root 'backups/.fixture.installation'
        [IO.Directory]::CreateDirectory($global:ContextExportDirectory)|Out-Null
        $global:ContextExportCaHash=$state.caHash
        Export-ReleaseHttpsRecovery -Context $context -MaterialDirectory $global:ContextExportDirectory
        $recovery=Get-Content -LiteralPath (Join-Path $global:ContextExportDirectory 'https-recovery.json') -Raw|ConvertFrom-Json
        Assert ($recovery.caHash -ceq $state.caHash) 'CA recovery metadata changed identity.'
        Assert ((Get-Item -LiteralPath (Join-Path $global:ContextExportDirectory 'https-recovery.tar')).Length -gt 0) 'CA recovery archive missing.'
        $global:ContextExportCaHash='0'*64;$rejected=$false
        try{Export-ReleaseHttpsRecovery -Context $context -MaterialDirectory $global:ContextExportDirectory}catch{$rejected=$_.Exception.Message -match 'CA|certificate'}
        Assert $rejected 'Exported CA archive with a different root was accepted.'
        $global:ContextExportDirectory=''
        $global:ContextWrongRedirect=$true;$rejected=$false
        try{Test-ReleaseHttpsAccess $context}catch{$rejected=$true}
        Assert $rejected 'Redirect to a different destination was accepted.'
    }finally{$lock.Dispose()}
    $rejected=$false
    try{Test-ReleaseInstallationLock -InstallationRoot $root -InstallationLock $lock|Out-Null}catch{$rejected=$true}
    Assert $rejected 'Disposed installation lock was accepted.'
    $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0);$listener.Start()
    try{
        $rejected=$false
        try{Assert-ReleaseHttpsPort -Address 127.0.0.1 -Port $listener.LocalEndpoint.Port}catch{$rejected=$true}
        Assert $rejected 'Occupied HTTPS port was accepted.'
    }finally{$listener.Stop()}
    Write-Host 'PASS: read-only HTTPS discovery, external CA preservation, changed identity/missing storage, held-lock validation and occupied-port rejection.'
}finally{
    Remove-Item Function:/docker,Function:/curl.exe -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($scratch)
    if((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-https-context-[a-f0-9]{32}$'){throw 'Unexpected context fixture cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
