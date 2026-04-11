$ErrorActionPreference = "Stop"

$nodePath = "C:\Users\y-tanabe\node-v20.12.2-win-x64"
if (-not (Test-Path "$nodePath\node.exe")) {
    Write-Host "Downloading Node.js portable using curl..."
    curl.exe -L -o "$env:TEMP\node.zip" "https://nodejs.org/dist/v20.12.2/node-v20.12.2-win-x64.zip"
    Write-Host "Extracting Node.js..."
    Expand-Archive "$env:TEMP\node.zip" -DestinationPath "C:\Users\y-tanabe" -Force
}
$env:Path = "$nodePath;$env:Path"

Write-Host ("Node version: " + (node -v))
Write-Host ("NPM version: " + (npm -v))

$targetDir = "C:\Users\y-tanabe\Desktop\task-tree\task-tree"
cd $targetDir

if (Test-Path "index.html") { 
    Write-Host "Backing up index.html..."
    Rename-Item index.html index_backup.html -Force
}

Write-Host "Initializing Vite app..."
npx -y create-vite@latest temp-vite-app --template react-ts
if (-not (Test-Path "temp-vite-app")) {
    Write-Error "Failed to create Vite app"
    exit 1
}

Write-Host "Moving Vite files up..."
cd temp-vite-app
Get-ChildItem -Force | Move-Item -Destination ..\ -Force
cd ..
Remove-Item temp-vite-app -Recurse -Force

Write-Host "Installing dependencies..."
npm install
npm install reactflow zustand zundo lucide-react uuid
npm install -D @types/uuid

Write-Host "Setup Completed."
