param(
    [int]$Port = 5177,
    [switch]$NoBrowser,
    [switch]$NoFullscreen,
    [switch]$InternalMovement,
    [string]$BrowserPath = ""
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = Get-Command node -ErrorAction SilentlyContinue

function Test-NodeExecutable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    try {
        $null = & $Path --version 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Wait-LocalServer {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    return $false
}

function Resolve-BrowserExecutable {
    param([string]$RequestedPath)

    $candidates = @()
    if ($RequestedPath) {
        $candidates += $RequestedPath
    }
    $candidates += @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
    )
    $chrome = Get-Command chrome -ErrorAction SilentlyContinue
    $edge = Get-Command msedge -ErrorAction SilentlyContinue
    if ($chrome) { $candidates += $chrome.Source }
    if ($edge) { $candidates += $edge.Source }

    $browser = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $browser) {
        throw "Chrome or Edge was not found. Pass -BrowserPath with a browser executable path."
    }
    return $browser
}

function New-NanoBrowserProfile {
    $profileRoot = Join-Path ([System.IO.Path]::GetTempPath()) "nano_sim_3d_browser"
    $profileDir = Join-Path $profileRoot ([guid]::NewGuid().ToString("N"))
    $null = New-Item -ItemType Directory -Path $profileDir -Force
    return $profileDir
}

function Remove-NanoBrowserProfile {
    param([string]$ProfileDir)

    if (-not $ProfileDir -or -not (Test-Path -LiteralPath $ProfileDir)) {
        return
    }

    $profileRoot = Join-Path ([System.IO.Path]::GetTempPath()) "nano_sim_3d_browser"
    $resolvedRoot = (Resolve-Path -LiteralPath $profileRoot).Path
    $resolvedProfile = (Resolve-Path -LiteralPath $ProfileDir).Path
    if ($resolvedProfile.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
    }
}

function Start-NanoBrowser {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter(Mandatory = $true)]
        [string]$Executable
    )

    $profileDir = New-NanoBrowserProfile
    $browserArgs = @(
        "--new-window",
        "--no-first-run",
        "--user-data-dir=$profileDir"
    )
    if (-not $NoFullscreen) {
        $browserArgs += "--start-fullscreen"
    }
    $browserArgs += "--app=$Url"

    $process = Start-Process -FilePath $Executable -ArgumentList $browserArgs -PassThru
    return [pscustomobject]@{
        Process = $process
        ProfileDir = $profileDir
    }
}

$nodeCandidates = @()
if ($node) {
    $nodeCandidates += $node.Source
}
if (Test-Path -LiteralPath $bundledNode) {
    $nodeCandidates += $bundledNode
}

$nodePath = $nodeCandidates | Where-Object { Test-NodeExecutable -Path $_ } | Select-Object -First 1
if (-not $nodePath) {
    throw "Node.js was not found. Install Node.js or run after Codex workspace dependencies are installed."
}

$env:PORT = [string]$Port
$serverPath = Join-Path $scriptDir "server.mjs"

if ($NoBrowser) {
    & $nodePath $serverPath
    exit $LASTEXITCODE
}

$serverProcess = $null
$browserLaunch = $null
$url = "http://127.0.0.1:$Port/"
$launchUrl = if ($InternalMovement) { $url } else { "http://127.0.0.1:$Port/?movement=main" }

try {
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @($serverPath) -WorkingDirectory $scriptDir -WindowStyle Hidden -PassThru
    if (-not (Wait-LocalServer -Url $url -TimeoutSeconds 30)) {
        throw "nano_sim_3d server did not become ready at $url"
    }

    $browser = Resolve-BrowserExecutable -RequestedPath $BrowserPath
    $browserLaunch = Start-NanoBrowser -Url $launchUrl -Executable $browser
    Wait-Process -Id $browserLaunch.Process.Id
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
    if ($browserLaunch) {
        Remove-NanoBrowserProfile -ProfileDir $browserLaunch.ProfileDir
    }
}
