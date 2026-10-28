# Real Windows ACLs and write-order checks; only synthetic files in a private test root.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if($env:OS -ne 'Windows_NT'){throw 'Run this ACL regression on Windows.'}
$source=Split-Path -Parent $PSScriptRoot
. (Join-Path $source 'deploy/release-common.ps1')
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-private-files-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$original=(Get-Location).Path
$global:PrivateInstallEnv=''
$global:PrivateInstallProtectedBeforeWrite=$false
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Private-Acl {
    $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))
    };return $acl
}
function Assert-Private([string]$Path){
    $acl=Get-Acl -LiteralPath $Path
    Assert $acl.AreAccessRulesProtected ('Secret file still inherits permissions: '+(Split-Path -Leaf $Path))
    $broad=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object{$_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545')})
    Assert (-not $broad.Count) 'Secret file grants broad read access.'
}
 $global:PrivateBeforeProtect={
    param([string]$LiteralPath)
    $text=if(Test-Path -LiteralPath $LiteralPath -PathType Leaf){[IO.File]::ReadAllText($LiteralPath)}else{''}
    if($LiteralPath -match '(-tmp|\.tmp|http-redirect\.env\.before)$' -and $text.Contains('synthetic-private-ENV')){throw 'Secret content was written before its private ACL.'}
    if($global:PrivateInstallEnv -and $LiteralPath -ieq $global:PrivateInstallEnv){
        if($text -match '(?m)^NEXTAUTH_SECRET=[^\r\n]+'){throw 'Generated installation keys were written before their private ACL.'}
        $global:PrivateInstallProtectedBeforeWrite=$true
    }
}
function global:icacls {
    if($global:PrivateInstallEnv -and [string]$args[0] -ieq $global:PrivateInstallEnv -and [IO.File]::ReadAllText($args[0]) -match '(?m)^NEXTAUTH_SECRET=[^\r\n]+'){throw 'Generated installation keys were written before their private ACL.'}
    & (Join-Path $env:SystemRoot 'System32/icacls.exe') @args
}
try{
    # Observe the native ACL I/O boundary in an isolated copy; all permission
    # operations and secret writes still execute the real implementation.
    $moduleText=[IO.File]::ReadAllText((Join-Path $source 'deploy/https/private-files.ps1'))
    $needle='param([string]$Path,$Descriptor)'
    Assert ($moduleText.Contains($needle)) 'Native ACL observation boundary changed.'
    $instrumented=Join-Path $scratch 'private-files.ps1'
    [IO.File]::WriteAllText($instrumented,$moduleText.Replace($needle,$needle+"`n    & `$global:PrivateBeforeProtect `$Path"))
    . $instrumented
    $directoryAcl=Get-Acl -LiteralPath $scratch
    $directoryAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::ReadAndExecute,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
    Microsoft.PowerShell.Security\Set-Acl -LiteralPath $scratch -AclObject $directoryAcl
    $envPath=Join-Path $scratch '.env'
    [IO.File]::WriteAllText($envPath,"VERSION=1.0.9`nNEXTAUTH_SECRET=synthetic-private-ENV`n")
    Microsoft.PowerShell.Security\Set-Acl -LiteralPath $envPath -AclObject (Private-Acl)
    $before=(Get-Acl -LiteralPath $envPath).Sddl
    Set-ReleaseVersion $envPath '1.0.10'
    Assert-Private $envPath
    Assert ((Get-Acl -LiteralPath $envPath).Sddl -ceq $before) 'Version replacement changed the original restricted ACL.'
    $backup=Join-Path $scratch '.http-redirect.env.before'
    Write-ReleasePrivateText -Path $backup -Text ([IO.File]::ReadAllText($envPath)) -SourcePath $envPath
    Assert-Private $backup
    Assert ([IO.File]::ReadAllText($backup).Contains('synthetic-private-ENV')) 'Private rollback content changed.'
    $install=Join-Path $scratch 'new-install';[IO.Directory]::CreateDirectory($install)|Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $install 'https'))|Out-Null
    foreach($name in @('install.ps1','release-common.ps1','release-https.ps1','env.example','https/private-files.ps1')){
        $inputPath=if($name -eq 'https/private-files.ps1'){$instrumented}else{Join-Path $source "deploy/$name"}
        Copy-Item -LiteralPath $inputPath -Destination (Join-Path $install $name)
    }
    $global:PrivateInstallEnv=Join-Path $install '.env'
    & (Join-Path $install 'install.ps1') -ConfigureOnly -NoBrowser
    Assert $global:PrivateInstallProtectedBeforeWrite 'Initial ENV was not protected before generated keys.'
    Assert-Private $global:PrivateInstallEnv
    Write-Host 'PASS: secret files protected before content, restricted ENV ACL survives atomic replacement, rollback private and initial keys protected before write.'
}finally{
    Set-Location -LiteralPath $original
    Remove-Item Function:/icacls -ErrorAction SilentlyContinue
    $resolved=[IO.Path]::GetFullPath($scratch)
    if((Split-Path -Parent $resolved) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $resolved) -notmatch '^infrascope-private-files-[a-f0-9]{32}$'){throw 'Unexpected ACL test cleanup path.'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
