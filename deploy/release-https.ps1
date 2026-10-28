# HTTPS discovery and lifecycle shared by the verified Windows release scripts.
Set-StrictMode -Version Latest

function Get-ReleaseDockerJson([string[]]$Arguments, [string]$Description) {
    $text = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Cannot inspect $Description." }
    return (($text -join "`n") | ConvertFrom-Json)
}
function Get-ReleaseLabel($Labels, [string]$Name) {
    $property = $Labels.PSObject.Properties[$Name]
    if ($property) { return [string]$property.Value }
    return ''
}
function Assert-ReleaseHttpsPort([string]$Address, [int]$Port) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse($Address), $Port)
    try { $listener.Start() } finally { $listener.Stop() }
}
function Test-ReleaseInstallationLock([string]$InstallationRoot, [IO.FileStream]$InstallationLock) {
    $expected = [IO.Path]::GetFullPath((Join-Path $InstallationRoot '.update.lock'))
    if (-not $InstallationLock -or $InstallationLock.SafeFileHandle.IsClosed -or -not $InstallationLock.CanWrite -or
        [IO.Path]::GetFullPath($InstallationLock.Name) -ine $expected) { throw 'A live installation update lock is required.' }
    $probe = $null; $exclusive = $false
    try { $probe = [IO.File]::Open($expected, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite) }
    catch [IO.IOException] { $exclusive = $true }
    finally { if ($probe) { $probe.Dispose() } }
    if (-not $exclusive) { throw 'The installation update lock must be exclusive.' }
    return $true
}
function Get-ReleaseHttpsContext {
    param(
        [Parameter(Mandatory=$true)][string]$InstallationRoot,
        [Parameter(Mandatory=$true)][string]$Project,
        [string]$PublicIp = '', [string]$HttpsDirectory = '',
        [ValidateRange(0,65535)][int]$HttpsPort = 0,
        [ValidateRange(0,65535)][int]$LegacyPort = 0,
        [ValidateRange(0,65535)][int]$BackendPort = 0
    )
    $InstallationRoot = [IO.Path]::GetFullPath($InstallationRoot)
    if ($Project -cnotmatch '^[a-z0-9][a-z0-9_-]{0,62}$') { throw 'Invalid installation project.' }
    $network = $Project + '_infrascope-net'
    $roots = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    if ($HttpsDirectory) {
        $directory = [IO.Path]::GetFullPath($HttpsDirectory)
        if (-not (Test-Path -LiteralPath (Join-Path $directory '.https-state.json'))) { throw 'Explicit HTTPS directory has no installation identity.' }
        [void]$roots.Add($directory)
    }
    $pointer = Join-Path $InstallationRoot '.release-https-state.json'
    if (Test-Path -LiteralPath $pointer) {
        $saved = Get-Content -LiteralPath $pointer -Raw | ConvertFrom-Json
        if ($saved.installationRoot -ine $InstallationRoot -or $saved.project -cne $Project) { throw 'Saved HTTPS installation ownership differs.' }
        if (-not $PublicIp) { $PublicIp=[string]$saved.publicIp }
        if (-not $HttpsPort) { $HttpsPort=[int]$saved.httpsPort }
        if (-not $LegacyPort) { $LegacyPort=[int]$saved.legacyPort }
        if (-not $BackendPort) { $BackendPort=[int]$saved.backendPort }
        if (Test-Path -LiteralPath (Join-Path $saved.proxyRoot '.https-state.json')) { [void]$roots.Add([IO.Path]::GetFullPath($saved.proxyRoot)) }
        elseif ($saved.caHash -or $saved.state -cne 'configuring' -or $saved.proxyRoot -ine (Join-Path $InstallationRoot 'https')) { throw 'Saved HTTPS identity is missing; restore it before updating.' }
    }
    foreach ($directory in @((Join-Path $InstallationRoot 'https'), (Join-Path (Split-Path -Parent $InstallationRoot) 'InfraScope-HTTPS'))) {
        if (Test-Path -LiteralPath (Join-Path $directory '.https-state.json')) { [void]$roots.Add([IO.Path]::GetFullPath($directory)) }
    }
    $ids = @(& docker ps -aq --filter 'label=io.infrascope.component=https')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot discover existing HTTPS projects.' }
    foreach ($id in $ids) {
        $info = @(Get-ReleaseDockerJson @('inspect', $id) 'HTTPS container')[0]
        $directory = Get-ReleaseLabel $info.Config.Labels 'com.docker.compose.project.working_dir'
        if ($directory -and (Test-Path -LiteralPath (Join-Path $directory '.https-state.json'))) {
            $identity = Get-Content -LiteralPath (Join-Path $directory '.https-state.json') -Raw | ConvertFrom-Json
            if ($identity.network -ceq $network) { [void]$roots.Add([IO.Path]::GetFullPath($directory)) }
        }
    }
    $contexts = @()
    foreach ($directory in $roots) {
        $statePath = Join-Path $directory '.https-state.json'
        if (-not (Test-Path -LiteralPath $statePath)) { throw 'Existing HTTPS identity is missing; restore it before updating.' }
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($state.network -cne $network) {
            if ($HttpsDirectory -and $directory -ieq [IO.Path]::GetFullPath($HttpsDirectory)) { throw 'HTTPS directory belongs to another installation.' }
            continue
        }
        if ($state.schema -ne 1 -or $state.root -ine $directory -or $state.project -cnotmatch '^[a-z0-9][a-z0-9_-]{0,53}$') { throw 'Invalid existing HTTPS ownership.' }
        if ($PublicIp -and $PublicIp -cne $state.ip) { throw 'Existing HTTPS IP address differs; refusing an implicit address change.' }
        if ($HttpsPort -and $HttpsPort -ne $state.port) { throw 'Existing HTTPS port differs.' }
        $hash = (Get-FileHash -LiteralPath (Join-Path $directory 'compose.yml')).Hash + ':' + (Get-FileHash -LiteralPath (Join-Path $directory 'Caddyfile')).Hash
        if ($hash -cne $state.configHash) { throw 'Existing HTTPS configuration changed.' }
        $caPath = Join-Path $directory 'infrascope-root-ca.crt'
        if ($state.caHash -and (-not (Test-Path -LiteralPath $caPath) -or (Get-ReleaseHash $caPath) -cne $state.caHash)) { throw 'Existing CA certificate identity differs.' }
        $volumeName = $state.project + '_caddy_data'
        if ($state.caHash) {
            $volume = @(Get-ReleaseDockerJson @('volume', 'inspect', $volumeName) 'CA storage volume')[0]
            if ((Get-ReleaseLabel $volume.Labels 'com.docker.compose.project') -cne $state.project -or
                (Get-ReleaseLabel $volume.Labels 'io.infrascope.component') -cne 'https') { throw 'CA storage ownership differs.' }
        }
        $redirect = $null
        if (Test-Path -LiteralPath (Join-Path $directory '.redirect-state.json')) {
            $redirect = Get-Content -LiteralPath (Join-Path $directory '.redirect-state.json') -Raw | ConvertFrom-Json
            if ($redirect.root -ine $directory -or $redirect.installation -ine $InstallationRoot -or $redirect.project -cne $Project -or $redirect.caHash -cne $state.caHash) { throw 'Existing redirect ownership or CA identity differs.' }
            $expectedTarget = 'https://' + $state.ip + $(if($state.port -eq 443){''}else{':'+$state.port})
            if ($redirect.target -cne $expectedTarget -or $redirect.redirectProject -cne ($state.project+'-redirect')) { throw 'Existing redirect destination differs.' }
            $redirectHash = (Get-ReleaseHash (Join-Path $directory 'Redirectfile')) + ':' + (Get-ReleaseHash (Join-Path $directory 'redirect-compose.yml'))
            if ($redirect.configHash -cne $redirectHash) { throw 'Existing redirect configuration changed.' }
            if ($LegacyPort -and $LegacyPort -ne $redirect.legacyPort) { throw 'Existing legacy HTTP port differs.' }
            if ($BackendPort -and $BackendPort -ne $redirect.backendPort) { throw 'Existing backend port differs.' }
        }
        $contexts += [pscustomobject]@{ Root=$directory; State=$state; Redirect=$redirect; CaPath=$caPath; VolumeName=$volumeName }
    }
    if ($contexts.Count -gt 1) { throw 'Multiple HTTPS installations match; resolve ownership before updating.' }
    if ($contexts.Count) {
        $match = $contexts[0]; $state = $match.State
        $PublicIp = [string]$state.ip; $HttpsPort = [int]$state.port
        if ($match.Redirect) { $LegacyPort = [int]$match.Redirect.legacyPort; $BackendPort = [int]$match.Redirect.backendPort }
        $directory = $match.Root; $proxyProject = [string]$state.project
        $caHash = [string]$state.caHash; $volumeName = $match.VolumeName
        $redirectComplete = $match.Redirect -and $match.Redirect.status -ceq 'complete'
        $needsSetup = $state.status -cne 'ready'
    } else {
        if (-not $PublicIp) { return $null }
        if ($Project.Length -gt 47) { throw 'Installation project is too long for HTTPS proxy names.' }
        $directory = Join-Path $InstallationRoot 'https'; $proxyProject = $Project + '-https'
        $caHash = ''; $volumeName = $proxyProject + '_caddy_data'; $redirectComplete = $false; $needsSetup = $true
    }
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($PublicIp,[ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
        $parsed.ToString() -cne $PublicIp -or $PublicIp -in @('0.0.0.0','255.255.255.255')) { throw 'Use a canonical server IPv4 address.' }
    if (-not $HttpsPort) { $HttpsPort=443 }
    if (-not $LegacyPort) {
        $setting = Get-ReleaseSetting (Join-Path $InstallationRoot '.env') 'APP_PORT'
        if ($setting -match '^([0-9]+)$') { $LegacyPort=[int]$Matches[1] } else { $LegacyPort=8170 }
    }
    if (-not $BackendPort) { $BackendPort=18170 }
    if (@($HttpsPort,$LegacyPort,$BackendPort|Sort-Object -Unique).Count -ne 3) { throw 'HTTPS, legacy HTTP and backend ports must differ.' }
    if (-not $contexts.Count) { Assert-ReleaseHttpsPort -Address $PublicIp -Port $HttpsPort }
    $appPort = Get-ReleaseSetting (Join-Path $InstallationRoot '.env') 'APP_PORT'
    if (-not $redirectComplete -and $appPort -cne ('127.0.0.1:'+$BackendPort)) { Assert-ReleaseHttpsPort -Address 127.0.0.1 -Port $BackendPort }
    $url = 'https://' + $PublicIp + $(if($HttpsPort -eq 443){''}else{':'+$HttpsPort})
    return [pscustomobject]@{
        InstallationRoot=$InstallationRoot; InstallationProject=$Project; Root=$directory; ProxyProject=$proxyProject;
        PublicIp=$PublicIp; HttpsPort=$HttpsPort; LegacyPort=$LegacyPort; BackendPort=$BackendPort; Url=$url;
        CaPath=(Join-Path $directory 'infrascope-root-ca.crt'); CaHash=$caHash; VolumeName=$volumeName;
        Existing=([bool]$caHash); NeedsSetup=$needsSetup; RedirectComplete=([bool]$redirectComplete)
    }
}

function Test-ReleaseHttpsAccess($Context) {
    $payload = & curl.exe --noproxy '*' --cacert $Context.CaPath --ssl-revoke-best-effort --fail --silent --show-error --connect-timeout 5 --max-time 15 ($Context.Url+'/api/health/ready')
    if ($LASTEXITCODE -ne 0 -or (($payload -join "`n")|ConvertFrom-Json).status -cne 'ready') { throw 'CA-verified HTTPS readiness failed.' }
    $headers = @(& curl.exe --noproxy '*' --silent --show-error --max-time 5 -D - -o NUL -H 'Host: invalid.example' ('http://'+$Context.PublicIp+':'+$Context.LegacyPort+'/login?next=%2Fdashboard'))
    $expected = 'Location: '+$Context.Url+'/login?next=%2Fdashboard'
    if ($LASTEXITCODE -ne 0 -or ($headers -join "`n") -notmatch '(?m)^HTTP/1\.[01] 308' -or @($headers|Where-Object{$_ -ceq $expected}).Count -ne 1) { throw 'Legacy HTTP redirect did not preserve the fixed HTTPS destination/path/query.' }
}
function Save-ReleaseHttpsContext($Context, [string]$State) {
    $path=Join-Path $Context.InstallationRoot '.release-https-state.json'
    $previous=if(Test-Path -LiteralPath $path){Get-Content -LiteralPath $path -Raw|ConvertFrom-Json}else{$null}
    $value=[pscustomobject]@{
        schema=1;installationRoot=$Context.InstallationRoot;project=$Context.InstallationProject;
        proxyRoot=$Context.Root;proxyProject=$Context.ProxyProject;publicIp=$Context.PublicIp;
        httpsPort=$Context.HttpsPort;legacyPort=$Context.LegacyPort;backendPort=$Context.BackendPort;
        caHash=$Context.CaHash;state=$State
    }
    if($previous){foreach($key in @('initialBackupName','initialBackup','initialBackupHash')){if($previous.PSObject.Properties.Name -contains $key){$value|Add-Member NoteProperty $key $previous.$key}}}
    Write-ReleaseJson $path $value
}

function Complete-ReleaseInitialRecovery {
    param($Context,[string]$RecoveryImage,[string]$PassphraseFile,[string]$SourceRoot=$PSScriptRoot)
    $path=Join-Path $Context.InstallationRoot '.release-https-state.json'
    $state=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
    if($state.PSObject.Properties.Name -notcontains 'initialBackupName'){
        $state|Add-Member NoteProperty initialBackupName ('infrascope-initial-secure-'+[Guid]::NewGuid().ToString('N'))
        $state|Add-Member NoteProperty initialBackup ''
        $state|Add-Member NoteProperty initialBackupHash ''
        Write-ReleaseJson $path $state
    }
    if($state.initialBackup){
        if(-not (Test-Path -LiteralPath $state.initialBackup) -or (Get-ReleaseHash $state.initialBackup) -cne $state.initialBackupHash){throw 'Initial HTTPS recovery bundle is missing or changed.'}
        return
    }
    $backup=& (Join-Path $SourceRoot 'backup.ps1') -PassphraseFile $PassphraseFile -InstallationRoot $Context.InstallationRoot -ProjectName $Context.InstallationProject -RecoveryImage $RecoveryImage -HttpsContext $Context -BackupName $state.initialBackupName -PassThru
    $state.initialBackup=$backup.FullName;$state.initialBackupHash=Get-ReleaseHash $backup.FullName
    Write-ReleaseJson $path $state
}
function Enable-ReleaseHttps {
    param($Context, [IO.FileStream]$InstallationLock, [string]$SourceRoot=$PSScriptRoot)
    if (-not $Context) { return $null }
    Test-ReleaseInstallationLock -InstallationRoot $Context.InstallationRoot -InstallationLock $InstallationLock | Out-Null
    if ($Context.Existing -and -not $Context.NeedsSetup -and $Context.RedirectComplete) {
        try {
            Test-ReleaseHttpsAccess $Context
            Save-ReleaseHttpsContext $Context 'ready'
            return $Context
        } catch { Write-Verbose 'Existing HTTPS is not ready; recovering the owned proxy services.' }
    }
    Save-ReleaseHttpsContext $Context 'configuring'
    & (Join-Path $SourceRoot 'https/install-https.ps1') -PublicIp $Context.PublicIp -InstallationProject $Context.InstallationProject -ProxyProject $Context.ProxyProject -HttpsPort $Context.HttpsPort -ConfigurationRoot $Context.Root
    if ($Context.RedirectComplete) {
        $redirectProject=$Context.ProxyProject+'-redirect'
        $ids=@(& docker ps -aq --filter "label=com.docker.compose.project=$redirectProject")
        if($LASTEXITCODE -ne 0){throw 'Cannot inspect existing redirect services.'}
        foreach($id in $ids){
            $info=@(Get-ReleaseDockerJson @('inspect',$id) 'redirect container')[0]
            if((Get-ReleaseLabel $info.Config.Labels 'io.infrascope.component') -cne 'http-redirect' -or (Get-ReleaseLabel $info.Config.Labels 'com.docker.compose.project.working_dir') -ine $Context.Root){throw 'Redirect service ownership differs.'}
        }
        $compose=@('compose','--project-directory',$Context.Root,'--env-file',(Join-Path $Context.Root '.redirect.env'),'-f',(Join-Path $Context.Root 'redirect-compose.yml'),'-p',$redirectProject)
        Invoke-ReleaseDocker ($compose+@('up','-d','--pull','never'))
    } else {
        & (Join-Path $SourceRoot 'https/install-redirect.ps1') -PublicIp $Context.PublicIp -InstallationRoot $Context.InstallationRoot -InstallationProject $Context.InstallationProject -ProxyProject $Context.ProxyProject -LegacyPort $Context.LegacyPort -BackendPort $Context.BackendPort -ConfigurationRoot $Context.Root -InstallationLock $InstallationLock
    }
    $fresh=Get-ReleaseHttpsContext -InstallationRoot $Context.InstallationRoot -Project $Context.InstallationProject -PublicIp $Context.PublicIp -HttpsDirectory $Context.Root -HttpsPort $Context.HttpsPort -LegacyPort $Context.LegacyPort -BackendPort $Context.BackendPort
    if($Context.Existing -and $fresh.CaHash -cne $Context.CaHash){throw 'HTTPS CA identity changed during update.'}
    Test-ReleaseHttpsAccess $fresh
    Save-ReleaseHttpsContext $fresh 'ready'
    return $fresh
}

function Export-ReleaseHttpsRecovery {
    param($Context, [Parameter(Mandatory=$true)][string]$MaterialDirectory)
    if (-not $Context -or -not $Context.Existing) { return }
    $material=[IO.Path]::GetFullPath($MaterialDirectory)
    $backupRoot=[IO.Path]::GetFullPath((Join-Path $Context.InstallationRoot 'backups'))+[IO.Path]::DirectorySeparatorChar
    if(-not $material.StartsWith($backupRoot,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $material -PathType Container)){throw 'CA recovery export requires protected installation backup staging.'}
    $fresh=Get-ReleaseHttpsContext -InstallationRoot $Context.InstallationRoot -Project $Context.InstallationProject -HttpsDirectory $Context.Root
    if($fresh.CaHash -cne $Context.CaHash){throw 'CA certificate identity changed before recovery export.'}
    $compose=@('compose','--project-directory',$Context.Root,'--env-file',(Join-Path $Context.Root '.env'),'-f',(Join-Path $Context.Root 'compose.yml'),'-p',$Context.ProxyProject)
    $config=Get-ReleaseDockerJson ($compose+@('config','--format','json')) 'HTTPS recovery image'
    $image=[string]$config.services.https.image
    if($image -cnotmatch '^caddy@sha256:[a-f0-9]{64}$'){throw 'HTTPS recovery requires the pinned official Caddy image.'}
    $command='tar -C /source -cf /export/https-recovery.tar caddy/pki/authorities/local; tar -xOf /export/https-recovery.tar caddy/pki/authorities/local/root.crt | sha256sum'
    $digest=& docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --volume ($Context.VolumeName+':/source:ro') --volume ($material+':/export') $image sh -ec $command
    if($LASTEXITCODE -ne 0 -or (($digest -join "`n") -split '\s+')[0] -cne $Context.CaHash){throw 'CA recovery archive did not match the trusted certificate.'}
    $archive=Join-Path $material 'https-recovery.tar'
    if(-not (Test-Path -LiteralPath $archive -PathType Leaf) -or (Get-Item -LiteralPath $archive).Length -gt 2MB){throw 'Invalid CA recovery archive size.'}
    $configuration=@{}
    foreach($name in @('compose.yml','Caddyfile','redirect-compose.yml','Redirectfile','.env','.redirect.env','.https-state.json','.redirect-state.json')){
        $path=Join-Path $Context.Root $name
        if(Test-Path -LiteralPath $path -PathType Leaf){$configuration[$name]=[IO.File]::ReadAllText($path)}
    }
    Write-ReleaseJson (Join-Path $material 'https-recovery.json') ([pscustomobject]@{
        schema=1;installationProject=$Context.InstallationProject;proxyProject=$Context.ProxyProject;
        originalProxyRoot=$Context.Root;publicIp=$Context.PublicIp;httpsPort=$Context.HttpsPort;
        legacyPort=$Context.LegacyPort;backendPort=$Context.BackendPort;caHash=$Context.CaHash;
        volumeName=$Context.VolumeName;archiveHash=(Get-ReleaseHash $archive);configuration=$configuration
    })
}
