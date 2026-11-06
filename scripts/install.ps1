param(
    [ValidateSet('family', 'dev')]
    [string]$Mode = 'family'
)

$ErrorActionPreference = 'Stop'
$location = Get-Location
try {
    Set-Location (Join-Path $PSScriptRoot '..')
    if (!(Get-Command node -ErrorAction SilentlyContinue) -or !(Get-Command npm -ErrorAction SilentlyContinue)) {
        throw '请先安装 Node.js 20（含 npm），然后重新运行本脚本。'
    }

    npm install
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败' }
    if ($Mode -eq 'dev') {
        Write-Host '启动 Vite 开发服务，请打开 http://localhost:5173/（以 Vite 输出为准）'
        npm run dev
        if ($LASTEXITCODE -ne 0) { throw '开发服务启动失败' }
    }
    else {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
        $port = if ($env:PORT) { $env:PORT } else { '4173' }
        Write-Host "启动家庭服务，请在服务就绪后打开 http://localhost:$port/"
        npm run start
        if ($LASTEXITCODE -ne 0) { throw '家庭服务启动失败' }
    }
}
finally {
    Set-Location $location
}
