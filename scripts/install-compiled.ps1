param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$BunExe = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($BunExe)) {
    $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    if ($bunCmd) {
        $BunExe = $bunCmd.Source
    }
}

if ([string]::IsNullOrWhiteSpace($BunExe)) {
    $fallbackBun = Join-Path $HOME ".bun\bin\bun.exe"
    if (Test-Path $fallbackBun) {
        $BunExe = $fallbackBun
    }
}

if ([string]::IsNullOrWhiteSpace($BunExe) -or -not (Test-Path $BunExe)) {
    throw "bun not found. install from https://bun.sh first."
}

$destDir = Join-Path $HOME ".local\bin"
New-Item -ItemType Directory -Path $destDir -Force | Out-Null

$entry = Join-Path $RepoRoot "ouroboros.ts"
$outFile = Join-Path $destDir "ouroboros.exe"

& $BunExe build --compile --outfile $outFile $entry
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path $outFile)) {
    throw "compile failed: output file missing: $outFile"
}

$fileInfo = Get-Item $outFile
if ($fileInfo.Length -le 0) {
    throw "compile failed: empty output file: $outFile"
}

$stream = [System.IO.File]::OpenRead($outFile)
try {
    $header = New-Object byte[] 2
    [void]$stream.Read($header, 0, 2)
} finally {
    $stream.Dispose()
}

if ($header[0] -ne 0x4D -or $header[1] -ne 0x5A) {
    throw "compile failed: output is not a valid Windows executable (missing MZ header)."
}

Write-Host "installed: $outFile"
