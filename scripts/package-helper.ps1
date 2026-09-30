$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
  dotnet publish helper/Eurocup3.Helper.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o artifacts/helper
  if ($LASTEXITCODE -ne 0) { throw 'Helper publish failed' }
  New-Item -ItemType Directory -Force artifacts/helper/wwwroot | Out-Null
  Get-ChildItem -LiteralPath artifacts/helper/wwwroot -Force | Remove-Item -Recurse -Force
  Get-ChildItem -LiteralPath dist | Where-Object Name -ne 'helper' | Copy-Item -Destination artifacts/helper/wwwroot -Recurse -Force
  $compilerPath = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
  if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Install Inno Setup 6 to build the per-user Windows installer.' }
  & $compilerPath installer/Eurocup3.iss
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
  $hash = (Get-FileHash -LiteralPath release/Eurocup3-Helper-Setup.exe -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath release/SHA256SUMS.txt -Value "$hash  Eurocup3-Helper-Setup.exe"
  New-Item -ItemType Directory -Force public/helper | Out-Null
  Copy-Item -LiteralPath release/Eurocup3-Helper-Setup.exe -Destination public/helper/Eurocup3-Helper-Setup.exe -Force
} finally { Pop-Location }
