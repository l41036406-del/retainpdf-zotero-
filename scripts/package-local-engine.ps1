param(
    [string]$RuntimeRoot = 'D:\retainpdf\resources\backend'
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$required = @('bin', 'scripts', 'ai_service', 'fonts', 'python', 'typst', 'typst-packages', 'bundle-manifest.json')
foreach ($entry in $required) {
    $path = Join-Path $RuntimeRoot $entry
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing runtime component: $path" }
}
if (-not (Test-Path -LiteralPath (Join-Path $RuntimeRoot 'scripts\entrypoints\run_translate_only.py'))) {
    throw 'Missing translation worker entrypoint: scripts\entrypoints\run_translate_only.py'
}

$archive = Join-Path $PSScriptRoot '..\build\retainpdf-zotero-engine-win32.zip'
$archive = [IO.Path]::GetFullPath($archive)
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force -ErrorAction Stop }

Push-Location $RuntimeRoot
try {
    Compress-Archive -Path $required -DestinationPath $archive -CompressionLevel Optimal
} finally {
    Pop-Location
}

Get-Item -LiteralPath $archive | Select-Object FullName, Length, LastWriteTime
