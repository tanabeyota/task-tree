$ErrorActionPreference = "Stop"

$node22Dir = "C:\Users\y-tanabe\node-v22.14.0-win-x64"
if (-not (Test-Path "$node22Dir\node.exe")) {
    Write-Host "Downloading Node.js 22.14.0..."
    curl.exe -L -o "$env:TEMP\node22.zip" "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip"
    Write-Host "Extracting..."
    Expand-Archive "$env:TEMP\node22.zip" -DestinationPath "C:\Users\y-tanabe" -Force
}

$env:Path = "$node22Dir;" + ($env:Path -replace [regex]::Escape("C:\Users\y-tanabe\node-v20.12.2-win-x64;"), "")

# Update User PATH permanently
$oldUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newUserPath = $oldUserPath -replace [regex]::Escape("C:\Users\y-tanabe\node-v20.12.2-win-x64"), "C:\Users\y-tanabe\node-v22.14.0-win-x64"
if ($newUserPath -notmatch [regex]::Escape($node22Dir)) {
    $newUserPath = "$node22Dir;$newUserPath"
}
[Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
Write-Host "User PATH Updated."

cd C:\Users\y-tanabe\Desktop\task-tree\task-tree
Write-Host "Removing old node_modules..."
if (Test-Path "node_modules") { Remove-Item -Recurse -Force node_modules }
if (Test-Path "package-lock.json") { Remove-Item -Force package-lock.json }

Write-Host "Running npm install..."
npm install
Write-Host "Setup Completed."
