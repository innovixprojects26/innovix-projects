param(
  [string]$Url = 'http://localhost:5173'
)

$chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$userDataDir = 'C:\Users\HP\AppData\Local\Google\Chrome\User Data'
$profilePath = Join-Path $userDataDir 'Profile 2'

if (-not (Test-Path $chromePath)) {
  throw "Chrome executable not found at: $chromePath"
}

if (-not (Test-Path $profilePath -PathType Container)) {
  throw "Innovix Chrome Profile 2 was not found at: $profilePath"
}

$parsedUrl = $null
if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$parsedUrl) -or $parsedUrl.Scheme -notin @('http', 'https')) {
  throw 'Provide an absolute HTTP or HTTPS URL.'
}

$arguments = @(
  "--user-data-dir=$userDataDir",
  '--profile-directory="Profile 2"',
  '--new-window',
  $parsedUrl.AbsoluteUri
)

& $chromePath $arguments
