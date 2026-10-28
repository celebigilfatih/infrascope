# Add legacy HTTP -> existing HTTPS without changing images, CA or database.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$PublicIp,
    [string]$InstallationRoot='C:\InfraScope\infrascope',
    [string]$InstallationProject='infrascope-musteri',
    [string]$ProxyProject='infrascope-https',
    [ValidateRange(1,65535)][int]$LegacyPort=8170,
    [ValidateRange(1,65535)][int]$BackendPort=18170,
    [ValidateSet('Apply','Rollback')][string]$Action='Apply',
    [string]$ConfigurationRoot=$PSScriptRoot,
    [IO.FileStream]$InstallationLock
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$parsed=$null
if (-not [Net.IPAddress]::TryParse($PublicIp,[ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.ToString() -cne $PublicIp -or $PublicIp -in @('0.0.0.0','255.255.255.255')) { throw 'Use a canonical server IPv4 address.' }
foreach($name in @($InstallationProject,$ProxyProject)) { if($name -cnotmatch '^[a-z0-9][a-z0-9_-]{0,53}$'){throw 'Invalid project name.'} }
if($InstallationProject -ceq $ProxyProject -or $LegacyPort -eq $BackendPort){throw 'Use distinct projects and ports.'}
$root=[IO.Path]::GetFullPath($ConfigurationRoot)
$InstallationRoot=(Resolve-Path -LiteralPath $InstallationRoot).Path
$updateLock=$null; $setupLock=$null; $mutating=$false; $journal=$null; $borrowedUpdateLock=$false
function Invoke-Checked([string[]]$Arguments) {
    & docker @Arguments | Out-Host
    if($LASTEXITCODE -ne 0){throw "Docker command failed (exit $LASTEXITCODE)."}
}
function Hash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save-Journal {
    [IO.File]::WriteAllText($journalPath+'.tmp',($journal|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath ($journalPath+'.tmp') -Destination $journalPath -Force
}
function Test-Https {
    $payload=& curl.exe --noproxy '*' --cacert $caPath --ssl-revoke-best-effort --fail --silent --show-error --connect-timeout 5 --max-time 15 ($target+'/api/health/ready')
    if($LASTEXITCODE -ne 0 -or ($payload|ConvertFrom-Json).status -cne 'ready'){throw 'Existing CA-verified HTTPS is not ready.'}
}
function Restore-Original {
    Invoke-Checked ($redirectCompose+@('down'))
    if((Hash $backupPath) -cne $journal.beforeHash){throw 'Original environment recovery file differs.'}
    Copy-Item -LiteralPath $backupPath -Destination $envPath -Force
    Invoke-Checked ($appCompose+@('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','app'))
    Test-Https
    $journal.status='rolled-back'; Save-Journal
}
try {
    if($InstallationLock){
        if($InstallationLock.SafeFileHandle.IsClosed -or -not $InstallationLock.CanWrite -or [IO.Path]::GetFullPath($InstallationLock.Name) -ine [IO.Path]::GetFullPath((Join-Path $InstallationRoot '.update.lock'))){throw 'Invalid borrowed installation lock.'}
        $updateLock=$InstallationLock; $borrowedUpdateLock=$true
    }else{
        $updateLock=[IO.File]::Open((Join-Path $InstallationRoot '.update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    }
    $setupLock=[IO.File]::Open((Join-Path $root '.setup.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    $tls=Get-Content -LiteralPath (Join-Path $root '.https-state.json') -Raw|ConvertFrom-Json
    $caPath=Join-Path $root 'infrascope-root-ca.crt'
    if($tls.root -ine $root -or $tls.project -cne $ProxyProject -or $tls.ip -cne $PublicIp -or $tls.network -cne ($InstallationProject+'_infrascope-net') -or $tls.status -cne 'ready' -or (Hash $caPath) -cne $tls.caHash){throw 'Existing HTTPS identity does not match. Run in the original HTTPS folder.'}
    if($LegacyPort -eq $tls.port -or $BackendPort -eq $tls.port){throw 'Ports must differ from HTTPS.'}
    $target='https://'+$PublicIp+$(if($tls.port -eq 443){''}else{':'+$tls.port})
    $redirectProject=$ProxyProject+'-redirect'
    if($redirectProject -ceq $InstallationProject){throw 'Redirect requires a separate project.'}
    $envPath=Join-Path $InstallationRoot '.env'
    $backupPath=Join-Path $InstallationRoot '.http-redirect.env.before'
    $journalPath=Join-Path $root '.redirect-state.json'
    $journal=if(Test-Path -LiteralPath $journalPath){Get-Content -LiteralPath $journalPath -Raw|ConvertFrom-Json}else{$null}
    $configHash=(Hash (Join-Path $root 'Redirectfile'))+':'+(Hash (Join-Path $root 'redirect-compose.yml'))
    $ids=@(& docker ps -aq --filter "label=com.docker.compose.project=$InstallationProject" --filter 'label=com.docker.compose.service=app')
    if($LASTEXITCODE -ne 0 -or $ids.Count -gt 1 -or ($ids.Count -eq 0 -and -not $journal)){throw 'Expected one app container or an existing recovery journal.'}
    $app=$null
    if($ids.Count -eq 1){
        $app=@((& docker inspect $ids[0])|ConvertFrom-Json)[0]
        if($LASTEXITCODE -ne 0 -or $app.Config.Labels.'com.docker.compose.project.working_dir' -ine $InstallationRoot){throw 'Application ownership differs.'}
        $files=@($app.Config.Labels.'com.docker.compose.project.config_files' -split ',')
        $expectedImage=$app.Config.Image
    }else{
        $files=@($journal.files)
        $expectedImage=$journal.image
    }
    if(-not $files.Count){throw 'Recovery Compose file list is missing.'}
    $appCompose=@('compose','--project-directory',$InstallationRoot,'--env-file',$envPath)
    $fileHashes=@()
    foreach($file in $files){
        $resolved=(Resolve-Path -LiteralPath $file).Path
        if(-not $resolved.StartsWith($InstallationRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Compose file lies outside installation.'}
        $appCompose+=@('-f',$resolved); $fileHashes+=Hash $resolved
    }
    $appCompose+=@('-p',$InstallationProject)
    $appConfigText=& docker @appCompose config --format json
    if($LASTEXITCODE -ne 0){throw 'Cannot validate existing application configuration.'}
    $appConfig=$appConfigText|ConvertFrom-Json
    if($appConfig.services.app.image -cne $expectedImage){throw 'Configured application image differs from deployed image. Refusing image change.'}
    $bindings=@($appConfig.services.app.ports)
    if($bindings.Count -ne 1 -or $bindings[0].target -ne 3000 -or $bindings[0].protocol -cne 'tcp'){throw 'Unexpected app port configuration.'}
    if($journal -and ($journal.schema -ne 1 -or $journal.root -ine $root -or $journal.installation -ine $InstallationRoot -or $journal.project -cne $InstallationProject -or $journal.redirectProject -cne $redirectProject -or $journal.target -cne $target -or $journal.legacyPort -ne $LegacyPort -or $journal.backendPort -ne $BackendPort -or $journal.configHash -cne $configHash -or ($journal.files -join ',') -ine ($files -join ',') -or $journal.filesHash -cne ($fileHashes -join ':') -or $journal.image -cne $expectedImage -or $journal.caHash -cne $tls.caHash -or $journal.status -cnotin @('planned','switching','complete','rolled-back'))){throw 'Migration identity/configuration changed. Refusing to overwrite.'}
    $existingRedirect=@(& docker ps -aq --filter "label=com.docker.compose.project=$redirectProject")
    if($LASTEXITCODE -ne 0){throw 'Cannot inspect redirect project.'}
    foreach($id in $existingRedirect){
        $existing=@((& docker inspect $id)|ConvertFrom-Json)[0]
        if(-not $journal -or $existing.Config.Labels.'io.infrascope.component' -cne 'http-redirect' -or $existing.Config.Labels.'com.docker.compose.project.working_dir' -ine $root){throw 'Redirect project is owned by another installation.'}
    }
    $redirectEnv=Join-Path $root '.redirect.env'
    $redirectSettings="HTTPS_TARGET=$target`nLEGACY_PORT=$LegacyPort`n"
    if((Test-Path -LiteralPath $redirectEnv) -and [IO.File]::ReadAllText($redirectEnv).Replace("`r`n","`n") -cne $redirectSettings){throw 'Redirect settings differ.'}
    [IO.File]::WriteAllText($redirectEnv,$redirectSettings,[Text.UTF8Encoding]::new($false))
    $redirectCompose=@('compose','--project-directory',$root,'--env-file',$redirectEnv,'-f',(Join-Path $root 'redirect-compose.yml'),'-p',$redirectProject)
    Invoke-Checked ($redirectCompose+@('config','--quiet'))
    if($journal){
        if((Hash $backupPath) -cne $journal.beforeHash -or (Hash $envPath) -cnotin @($journal.beforeHash,$journal.afterHash)){throw 'Environment changed since migration; refusing overwrite.'}
    }else{
        if($Action -eq 'Rollback'){throw 'No redirect migration to roll back.'}
        Test-Https
        if($app.State.Health.Status -cne 'healthy' -or $bindings[0].published -ne $LegacyPort){throw 'Original app must be healthy on the requested legacy port.'}
        if(Test-Path -LiteralPath $backupPath){throw 'Unrecognized recovery environment file exists.'}
        $original=[IO.File]::ReadAllText($envPath)
        if([regex]::Matches($original,'(?m)^APP_PORT=[^\r\n]*').Count -ne 1 -or [regex]::Match($original,'(?m)^APP_PORT=([^\r\n]*)').Groups[1].Value -cne [string]$LegacyPort){throw 'Expected one numeric APP_PORT matching legacy port.'}
        $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$BackendPort)
        try{$probe.Start()}finally{$probe.Stop()}
        Copy-Item -LiteralPath $envPath -Destination $backupPath
        $updated=[regex]::Replace($original,'(?m)^APP_PORT=[^\r\n]*',('APP_PORT=127.0.0.1:'+$BackendPort))
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes($updated)
        $sha=[Security.Cryptography.SHA256]::Create()
        try{$afterHash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
        $journal=[pscustomobject]@{schema=1;root=$root;installation=$InstallationRoot;project=$InstallationProject;redirectProject=$redirectProject;target=$target;legacyPort=$LegacyPort;backendPort=$BackendPort;configHash=$configHash;files=@($files);filesHash=($fileHashes -join ':');image=$expectedImage;caHash=$tls.caHash;beforeHash=(Hash $envPath);afterHash=$afterHash;status='planned'}
        Save-Journal
    }
    if($Action -eq 'Rollback'){
        $mutating=$true; Restore-Original; $mutating=$false
        Write-Host 'Redirect removed; original HTTP port restored. Existing HTTPS and CA retained.'; return
    }
    Invoke-Checked ($redirectCompose+@('pull'))
    # Validate Caddy before app downtime, including environment substitution.
    Invoke-Checked ($redirectCompose+@('run','--rm','--no-deps','redirect','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'))
    if((Hash $envPath) -ceq $journal.beforeHash){
        $mutating=$true
        $original=[IO.File]::ReadAllText($backupPath)
        $updated=[regex]::Replace($original,'(?m)^APP_PORT=[^\r\n]*',('APP_PORT=127.0.0.1:'+$BackendPort))
        [IO.File]::WriteAllText($envPath+'.redirect.tmp',$updated,[Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath ($envPath+'.redirect.tmp') -Destination $envPath -Force
    }
    $mutating=$true
    $journal.status='switching'; Save-Journal
    Invoke-Checked ($appCompose+@('up','-d','--no-deps','--pull','never','--wait','--wait-timeout','180','app'))
    Invoke-Checked ($redirectCompose+@('up','-d','--pull','never'))
    Test-Https
    $expected=$target+'/login?next=%2Fdashboard'
    $verified=$false
    for($attempt=0;$attempt -lt 20;$attempt++){
        $prior=$ErrorActionPreference
        try{$ErrorActionPreference='Continue'; $headers=& curl.exe --noproxy '*' --silent --show-error --max-time 5 -D - -o NUL -H 'Host: invalid.example' ('http://'+$PublicIp+':'+$LegacyPort+'/login?next=%2Fdashboard') 2>$null; $ok=($LASTEXITCODE -eq 0)}finally{$ErrorActionPreference=$prior}
        if($ok -and ($headers -join "`n") -match '(?m)^HTTP/1\.[01] 308' -and @($headers|Where-Object{$_ -ceq ('Location: '+$expected)}).Count -eq 1){$verified=$true;break}
        Start-Sleep -Milliseconds 500
    }
    if(-not $verified){throw 'Legacy redirect did not return expected HTTPS location.'}
    $journal.status='complete'; Save-Journal; $mutating=$false
    Write-Host "Redirect ready: http://${PublicIp}:$LegacyPort -> $target (path/query preserved)"
    Write-Host "Existing HTTPS CA retained: $($tls.caHash). Client certificate trust is still required."
}catch{
    if($mutating -and $journal){
        try{Restore-Original; Write-Warning 'Migration failed; original app port and environment were restored.'}
        catch{Write-Warning 'Rollback incomplete. Keep recovery files and rerun the same command with -Action Rollback.'}
    }
    throw
}finally{
    if($setupLock){$setupLock.Dispose()}; if($updateLock -and -not $borrowedUpdateLock){$updateLock.Dispose()}
}
