#ifndef AppBrand
  #define AppBrand "MKBT"
#endif

#if AppBrand == "Epic"
  #define BrandName "Epic Simracing Content Manager"
  #define BrandPublisher "Epic Simracing"
  #define BrandSlug "epic"
  #define BrandAppId "{{E7776544-F67A-40A1-93BC-925AB78D3B74}"
  #define BrandAppUserModelId "EpicSimracing.ContentManager"
  #define BrandExe "EpicSimracing.ContentManager.exe"
  #define BrandSetup "EpicSimracing-Content-Manager-Setup"
#elif AppBrand == "MKBT"
  #define BrandName "MKBT Content Manager"
  #define BrandPublisher "MakroBeasts"
  #define BrandSlug "mkbt"
  #define BrandAppId "{{AAE7531D-FB8F-4F7A-BBDC-8D41122CF795}"
  #define BrandAppUserModelId "MKBT.ContentManager"
  #define BrandExe "MKBT.ContentManager.exe"
  #define BrandSetup "MKBT-Content-Manager-Setup"
#else
  #error AppBrand must be MKBT or Epic
#endif

[Setup]
AppId={#BrandAppId}
AppName={#BrandName}
AppVersion=1.8.0
AppPublisher={#BrandPublisher}
DefaultDirName={localappdata}\Programs\{#BrandName}
DefaultGroupName={#BrandName}
PrivilegesRequired=lowest
OutputDir=..\release\{#BrandSlug}
OutputBaseFilename={#BrandSetup}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\public\brands\{#BrandSlug}\app.ico
UninstallDisplayIcon={app}\{#BrandExe}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Files]
Source: "..\artifacts\helper\{#BrandSlug}\*"; Excludes: "*.WebView2\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#BrandName}"; Filename: "{app}\{#BrandExe}"; WorkingDir: "{app}"; IconFilename: "{app}\{#BrandExe}"; IconIndex: 0; AppUserModelID: "{#BrandAppUserModelId}"
Name: "{autodesktop}\{#BrandName}"; Filename: "{app}\{#BrandExe}"; WorkingDir: "{app}"; IconFilename: "{app}\{#BrandExe}"; IconIndex: 0; AppUserModelID: "{#BrandAppUserModelId}"

[Run]
Filename: "{app}\{#BrandExe}"; Description: "Open {#BrandName}"; Flags: nowait postinstall skipifsilent
