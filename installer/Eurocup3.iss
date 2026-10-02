[Setup]
AppId={{C6CA9810-EC30-4FB2-86DB-40608F30F240}
AppName=Eurocup 3 Content Manager
AppVersion=1.3.35
AppPublisher=Eurocup 3
DefaultDirName={localappdata}\Programs\Eurocup3
DefaultGroupName=Eurocup 3
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=Eurocup3-Helper-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\helper\Assets\ec3.ico
UninstallDisplayIcon={app}\Eurocup3.Helper.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Files]
Source: "..\artifacts\helper\*"; Excludes: "Eurocup3.Helper.exe.WebView2\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Eurocup 3 Content Manager"; Filename: "{app}\Eurocup3.Helper.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Eurocup3.Helper.exe"; IconIndex: 0
Name: "{autodesktop}\Eurocup 3 Content Manager"; Filename: "{app}\Eurocup3.Helper.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Eurocup3.Helper.exe"; IconIndex: 0

[Run]
Filename: "{app}\Eurocup3.Helper.exe"; Description: "Open Eurocup 3 Content Manager"; Flags: nowait postinstall skipifsilent
