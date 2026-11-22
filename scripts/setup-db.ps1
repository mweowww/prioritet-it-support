$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$secret=Read-Host 'Enter the PostgreSQL installation password (postgres)' -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $env:PGPASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    & node scripts/setup-db.js
    if ($LASTEXITCODE) { throw 'Database setup failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
