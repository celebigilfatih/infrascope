# Portable encrypted recovery, including the installation-owned HTTPS CA.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$PassphraseFile,
    [string]$InstallationRoot='',
    [string]$RecoveryImage='',
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$ProjectName='',
    [ValidatePattern('^infrascope-[A-Za-z0-9][A-Za-z0-9.-]{1,120}$')][string]$BackupName,
    $HttpsContext=$null,
    [switch]$PassThru
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if(-not $InstallationRoot){$InstallationRoot=$PSScriptRoot}
$OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'release-common.ps1')
. (Join-Path $PSScriptRoot 'release-https.ps1')
$InstallationRoot=(Resolve-Path -LiteralPath $InstallationRoot).Path
$originalLocation=(Get-Location).Path
$compose=@(Get-ReleaseCompose $InstallationRoot $ProjectName)
$material=$null;$passphrase=$null;$dumpAttempted=$false
try {
    Set-Location -LiteralPath $InstallationRoot
    $passphrase=[IO.File]::ReadAllText((Resolve-Path -LiteralPath $PassphraseFile).Path).TrimEnd("`r","`n")
    if([Text.Encoding]::UTF8.GetByteCount($passphrase) -lt 16 -or $passphrase.Contains("`n") -or $passphrase.Contains("`r")){throw 'Use one line containing at least16 bytes for the recovery passphrase.'}
    if(-not $RecoveryImage -or -not $ProjectName){
        $config=Get-ReleaseDockerJson ($compose+@('config','--format','json')) 'recovery configuration'
        if(-not $ProjectName){$ProjectName=[string]$config.name;$compose=@(Get-ReleaseCompose $InstallationRoot $ProjectName)}
        if(-not $RecoveryImage){
            $RecoveryImage=& docker image inspect $config.services.nms.image --format '{{.Id}}'
            if($LASTEXITCODE -ne 0){throw 'Installed recovery image is unavailable.'}
        }
    }
    if($RecoveryImage -cnotmatch '^(sha256:[a-f0-9]{64}|[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64})$'){throw 'Recovery requires an immutable NMS image.'}
    if(-not $BackupName){$BackupName='infrascope-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)}
    $backups=Join-Path $InstallationRoot 'backups';[IO.Directory]::CreateDirectory($backups)|Out-Null
    $output=Join-Path $backups ($BackupName+'.isbackup')
    $runtime=@('run','--rm','--network','none','--env-file',(Join-Path $InstallationRoot '.env'),'--volume',($backups+':/recovery'),'-i','--entrypoint','python',$RecoveryImage,'-m','nms_service.recovery')
    if(Test-Path -LiteralPath $output -PathType Leaf){
        $passphrase|& docker @runtime verify --input ('/recovery/'+$BackupName+'.isbackup')|Out-Host
        if($LASTEXITCODE -ne 0){throw 'Existing recovery bundle failed authentication; refusing to reuse or replace it.'}
        Write-Host 'Existing authenticated recovery bundle retained.'
        if($PassThru){Get-Item -LiteralPath $output};return
    }
    $material=Join-Path $backups ('.'+$BackupName+'.installation')
    [IO.Directory]::CreateDirectory($material)|Out-Null
    if($env:OS -eq 'Windows_NT'){
        $owner=[Security.Principal.WindowsIdentity]::GetCurrent().Name
        & icacls $material /inheritance:r /grant:r "${owner}:(OI)(CI)(F)" '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)'|Out-Null
        if($LASTEXITCODE -ne 0){throw 'Cannot protect recovery staging permissions.'}
    }
    Copy-Item -LiteralPath (Join-Path $InstallationRoot '.env') -Destination (Join-Path $material 'environment.env') -Force
    foreach($pair in @(@('data/machine-id/machine-id','machine-id'),@('data/license-cache/license.json','license.json'))){
        $path=Join-Path $InstallationRoot $pair[0]
        if(Test-Path -LiteralPath $path){Copy-Item -LiteralPath $path -Destination (Join-Path $material $pair[1]) -Force}
    }
    if(-not $HttpsContext){$HttpsContext=Get-ReleaseHttpsContext -InstallationRoot $InstallationRoot -Project $ProjectName}
    Export-ReleaseHttpsRecovery -Context $HttpsContext -MaterialDirectory $material
    $dumpAttempted=$true
    Invoke-ReleaseDocker ($compose+@('exec','-T','postgres','sh','-c','pg_dump -Fc --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB" -f "$1"','sh',('/tmp/.'+$BackupName+'.dump')))
    Invoke-ReleaseDocker ($compose+@('cp',('postgres:/tmp/.'+$BackupName+'.dump'),(Join-Path $material 'database.dump')))
    $passphrase|& docker @runtime create --dump ('/recovery/.'+$BackupName+'.installation/database.dump') --installation-dir ('/recovery/.'+$BackupName+'.installation') --output ('/recovery/'+$BackupName+'.isbackup')|Out-Host
    if($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output -PathType Leaf) -or (Get-Item -LiteralPath $output).Length -le 0){throw 'Recovery bundle creation failed.'}
    Write-Host "Encrypted recovery bundle: backups/$BackupName.isbackup"
    Write-Host 'Copy it to independent storage and keep the passphrase separately.'
    if($PassThru){Get-Item -LiteralPath $output}
}finally{
    $passphrase=$null
    if($material -and (Test-Path -LiteralPath $material)){
        foreach($name in @('environment.env','machine-id','license.json','database.dump','https-recovery.tar','https-recovery.json')){
            $path=Join-Path $material $name
            if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}
        }
        [IO.Directory]::Delete($material)
    }
    if($dumpAttempted){& docker @compose exec -T postgres rm -f ('/tmp/.'+$BackupName+'.dump')|Out-Null}
    Set-Location -LiteralPath $originalLocation
}
