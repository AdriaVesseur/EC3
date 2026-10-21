param(
  [ValidateSet('MKBT', 'Epic', 'All')]
  [string]$Brand = 'MKBT'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousWebBrand = $env:VITE_APP_BRAND
$brands = if ($Brand -eq 'All') { @('MKBT', 'Epic') } elseif ($Brand -eq 'Epic') { @('Epic') } else { @('MKBT') }
$compilerPath = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
Push-Location $projectRoot
try {
  if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Install Inno Setup 6 to build the per-user Windows installer.' }
  foreach ($currentBrand in $brands) {
    $slug = $currentBrand.ToLowerInvariant()
    $installerName = if ($currentBrand -eq 'Epic') { 'EpicSimracing-Content-Manager-Setup.exe' } else { 'MKBT-Content-Manager-Setup.exe' }
    $webOutput = "dist/$slug"
    $publishOutput = "artifacts/helper/$slug"
    $releaseOutput = "release/$slug"
    $env:VITE_APP_BRAND = $slug
    npm run build -- --outDir $webOutput
    if ($LASTEXITCODE -ne 0) { throw "$currentBrand web build failed" }
    dotnet publish helper/Eurocup3.Helper.csproj -c Release -r win-x64 --self-contained true -p:AppBrand=$currentBrand -p:BrandedExecutable=true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $publishOutput
    if ($LASTEXITCODE -ne 0) { throw "$currentBrand helper publish failed" }
    $publishRootTarget = [IO.Path]::GetFullPath((Join-Path $projectRoot $publishOutput))
    $webRootTarget = [IO.Path]::GetFullPath((Join-Path $publishRootTarget 'wwwroot'))
    if (-not $webRootTarget.StartsWith($publishRootTarget + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw 'The web resource cleanup target must stay inside the brand publication directory.'
    }
    New-Item -ItemType Directory -Force -Path $webRootTarget | Out-Null
    Get-ChildItem -LiteralPath $webRootTarget -Force | Remove-Item -Recurse -Force
    Get-ChildItem -LiteralPath $webOutput | Where-Object Name -ne 'helper' | Copy-Item -Destination $webRootTarget -Recurse -Force
    & $compilerPath "/DAppBrand=$currentBrand" installer/Eurocup3.iss
    if ($LASTEXITCODE -ne 0) { throw "$currentBrand installer build failed" }
    $installerPath = Join-Path $releaseOutput $installerName
    $hash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath (Join-Path $releaseOutput 'SHA256SUMS.txt') -Value "$hash  $installerName"
    $publicTarget = "public/helper/$slug"
    New-Item -ItemType Directory -Force -Path $publicTarget | Out-Null
    Copy-Item -LiteralPath $installerPath -Destination (Join-Path $publicTarget $installerName) -Force
    Write-Output "$currentBrand installer: $installerPath"
  }
} finally {
  $env:VITE_APP_BRAND = $previousWebBrand
  Pop-Location
}
