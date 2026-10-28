# Real configuration code; no daemon, customer installation or browser.
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$source=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('infrascope-install-check-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch)|Out-Null
$original=(Get-Location).Path
try{
    foreach($name in @('install.ps1','release-common.ps1','release-https.ps1','env.example')){Copy-Item -LiteralPath (Join-Path $source "deploy/$name") -Destination $scratch}
    $phrase=Join-Path $scratch 'phrase.txt';[IO.File]::WriteAllText($phrase,'synthetic-recovery-passphrase')
    & (Join-Path $scratch 'install.ps1') -ConfigureOnly -NoBrowser -ProjectName fixture -PublicIp 127.0.0.1 -HttpsPort 18443 -AppPort 18271 -BackendPort 18272 -PassphraseFile $phrase
    $path=Join-Path $scratch '.env'
    . (Join-Path $source 'deploy/release-common.ps1')
    if((Get-ReleaseSetting $path 'NEXTAUTH_URL') -cne 'https://127.0.0.1:18443'){throw 'New installation authentication URL is not HTTPS.'}
    $text=[IO.File]::ReadAllText($path).Replace('APP_PORT=18271','APP_PORT=127.0.0.1:18272')
    [IO.File]::WriteAllText($path,$text,[Text.UTF8Encoding]::new($false))
    & (Join-Path $scratch 'install.ps1') -ConfigureOnly -NoBrowser -ProjectName fixture -PublicIp 127.0.0.1 -HttpsPort 18443 -AppPort 18271 -BackendPort 18272 -PassphraseFile $phrase
    if([IO.File]::ReadAllText($path) -cne $text){throw 'Retry overwrote HTTPS URL, backend binding or installation secrets.'}
    Write-Host 'PASS: fresh HTTPS URLs and retry preservation of settings, secrets and loopback backend.'
}finally{
    Set-Location -LiteralPath $original
    if((Split-Path -Parent $scratch) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or (Split-Path -Leaf $scratch) -notmatch '^infrascope-install-check-[a-f0-9]{32}$'){throw 'Unexpected cleanup path.'}
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
