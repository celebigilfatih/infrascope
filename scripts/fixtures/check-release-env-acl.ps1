param([Parameter(Mandatory=$true)][string]$InstallationRoot)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Windows ACL check required.'}
foreach($name in @('.env','.http-redirect.env.before')){
    $path=Join-Path $InstallationRoot $name
    $acl=Get-Acl -LiteralPath $path
    if(-not $acl.AreAccessRulesProtected){throw 'Secret file still inherits permissions.'}
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
        if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-32-546')){throw 'Secret file grants broad local read access.'}
    }
}
Write-Host 'Private ENV ACLs verified.'
