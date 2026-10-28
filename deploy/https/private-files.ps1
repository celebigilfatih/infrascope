# Shared by the standalone HTTPS helpers and the verified release scripts.
function Set-ReleasePrivateAccess {
    param([string]$Path,$Descriptor)
    # Persist only modified DACL rules. Set-Acl's full-descriptor retry can request
    # audit privileges when reapplying an already protected Windows file.
    $info=[IO.FileInfo]::new($Path)
    if($info.GetType().GetMethod('SetAccessControl')){$info.SetAccessControl($Descriptor)}
    else{[IO.FileSystemAclExtensions]::SetAccessControl($info,$Descriptor)}
}
function Protect-ReleasePrivateFile {
    param([Parameter(Mandatory=$true)][string]$Path,[string]$SourcePath='')
    if($env:OS -ne 'Windows_NT'){return}
    $acl=Get-Acl -LiteralPath $(if($SourcePath){$SourcePath}else{$Path})
    $broad=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object{
        $_.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and
        $_.IdentityReference.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546')
    })
    # Preserve an existing restricted descriptor. Replace inherited/public ACLs
    # with the installation's owner, current operator, SYSTEM and Administrators.
    if(-not $acl.AreAccessRulesProtected -or $broad.Count){
        $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier])
        $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetOwner($owner);$acl.SetAccessRuleProtection($true,$false)
        foreach($sid in @($owner,[Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){
            $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.AccessControlType]::Allow))
        }
    }
    # Apply only access rules; copying audit/owner sections can require privileges
    # unavailable to the normal Docker Desktop operating user.
    $descriptor=[Security.AccessControl.FileSecurity]::new()
    $descriptor.SetAccessRuleProtection($true,$false)
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
        $descriptor.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($rule.IdentityReference,$rule.FileSystemRights,$rule.AccessControlType))
    }
    Set-ReleasePrivateAccess -Path $Path -Descriptor $descriptor
}
function Write-ReleasePrivateText {
    param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][AllowEmptyString()][string]$Text,[string]$SourcePath='')
    # Opening without truncation creates only an empty file before protection.
    $empty=[IO.File]::Open($Path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $empty.Dispose()
    Protect-ReleasePrivateFile -Path $Path -SourcePath $SourcePath
    [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($false))
}
function Set-ReleasePrivateText {
    param([Parameter(Mandatory=$true)][string]$Path,[Parameter(Mandatory=$true)][AllowEmptyString()][string]$Text)
    $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.private.tmp'
    try{
        Protect-ReleasePrivateFile -Path $Path
        Write-ReleasePrivateText -Path $temporary -Text $Text -SourcePath $Path
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}
}
