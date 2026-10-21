# Isolated behavioral checks for real Windows installer configuration; no running services.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Split-Path -Parent $PSScriptRoot
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('infrascope-win-install-test-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($scratch) | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'deploy/install.ps1') -Destination $scratch
$template = [IO.File]::ReadAllText((Join-Path $source 'deploy/env.example')).Replace('VERSION=1.0.0', 'VERSION=9.8.7-test')
[IO.File]::WriteAllText((Join-Path $scratch 'env.example'), $template, [Text.UTF8Encoding]::new($false))
function Check([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Read-Settings {
    $settings = @{}
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $scratch '.env'))) {
        if ($line -cmatch '^([A-Z_]+)=(.*)$') { $settings[$matches[1]] = $matches[2] }
    }
    return $settings
}
$original = (Get-Location).Path
try {
    & (Join-Path $scratch 'install.ps1') -ConfigureOnly -NoBrowser -AppPort 18171 -ProjectName infrascope-win-config-test
    $first = Read-Settings
    Check ($first['VERSION'] -eq '9.8.7-test') ('Packaged version was lost. Keys: ' + ($first.Keys -join ','))
    Check ($first.APP_PORT -eq '18171' -and $first.NEXTAUTH_URL -eq 'http://localhost:18171') 'Port/URL mismatch.'
    Check ($first.COMPOSE_PROJECT_NAME -eq 'infrascope-win-config-test') 'Project name was lost.'
    Check ($first.POSTGRES_PASSWORD -match '^[a-f0-9]{64}$') 'Database password is not a URL-safe random value.'
    foreach ($key in @('NEXTAUTH_SECRET', 'INTEGRATION_CREDENTIALS_KEY', 'NMS_INTERNAL_TOKEN')) {
        Check (([Convert]::FromBase64String($first[$key])).Length -eq 32) "Invalid generated key: $key"
    }
    Check ((@($first.POSTGRES_PASSWORD, $first.NEXTAUTH_SECRET, $first.INTEGRATION_CREDENTIALS_KEY, $first.NMS_INTERNAL_TOKEN) | Select-Object -Unique).Count -eq 4) 'Installation keys were reused.'
    & (Join-Path $scratch 'install.ps1') -ConfigureOnly -NoBrowser
    $second = Read-Settings
    foreach ($key in $first.Keys) { Check ($first[$key] -eq $second[$key]) "Existing setting changed on rerun: $key" }
    $bytes = [IO.File]::ReadAllBytes((Join-Path $scratch '.env'))
    Check (-not ($bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)) 'ENV contains UTF-8 BOM.'
    foreach ($directory in @('data/machine-id', 'data/license-cache', 'backups/database', 'logs', 'certs', 'images')) {
        Check (Test-Path -LiteralPath (Join-Path $scratch $directory) -PathType Container) "Missing directory: $directory"
    }
    $bad = [IO.File]::ReadAllText((Join-Path $scratch '.env')).Replace('VERSION=9.8.7-test', 'VERSION=latest')
    [IO.File]::WriteAllText((Join-Path $scratch '.env'), $bad, [Text.UTF8Encoding]::new($false))
    $rejected = $false
    try { & (Join-Path $scratch 'install.ps1') -ConfigureOnly -NoBrowser } catch { $rejected = $_.Exception.Message -match 'VERSION must' }
    Check $rejected 'Unpinned version was accepted.'
    [IO.File]::WriteAllText((Join-Path $scratch '.env'), $bad.Replace('VERSION=latest', 'VERSION=9.8.7-test'), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $scratch 'images/infrascope-9.8.7-test.tar'), 'SYNTHETIC TAMPERED ARCHIVE')
    [IO.File]::WriteAllText((Join-Path $scratch 'images/image-manifest.json'), '{"images":[{"file":"infrascope-9.8.7-test.tar","sha256":"0000000000000000000000000000000000000000000000000000000000000000","id":"rejected-before-loading"}]}')
    $rejected = $false
    try { & (Join-Path $scratch 'install.ps1') -NoBrowser } catch { $rejected = $_.Exception.Message -match 'checksum mismatch' }
    Check $rejected 'Tampered image was not rejected before Docker load.'
    Write-Host 'PASS: Windows configuration, unique secrets, version, paths, UTF-8, rerun preservation and invalid-version rejection.'
    Write-Host 'PASS: Tampered image checksum rejected before image loading or service creation.'
} finally {
    Set-Location -LiteralPath $original
    # This absolute target was created above under the OS temp directory solely for this check.
    $resolved = [IO.Path]::GetFullPath($scratch)
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'infrascope-win-install-test-*') { throw 'Unexpected cleanup target.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
