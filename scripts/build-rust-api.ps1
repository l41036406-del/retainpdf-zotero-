$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$vsPath = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
Import-Module (Join-Path $vsPath 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $vsPath -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'

$env:RUSTUP_HOME = 'C:\Users\HUAWEI\.rustup'
$env:CARGO_HOME = 'C:\Users\HUAWEI\.cargo'
$cargo = Join-Path $env:CARGO_HOME 'bin\cargo.exe'
& $cargo build --release --manifest-path 'reference-retain-pdf\backend\rust_api\Cargo.toml'
if ($LASTEXITCODE -ne 0) { throw "RetainPDF Rust API build failed with exit code $LASTEXITCODE" }

Get-Item -LiteralPath 'reference-retain-pdf\backend\rust_api\target\release\rust_api.exe' |
    Select-Object FullName, Length, LastWriteTime
