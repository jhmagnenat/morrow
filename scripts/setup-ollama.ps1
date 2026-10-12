param([string]$Model = 'qwen3.5:4b')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$directory = Join-Path $workspace '.tools\ollama'
$baseUrl = 'http://127.0.0.1:11434'
New-Item -ItemType Directory -Force -Path $directory | Out-Null
function ServerReady {
    try { Invoke-RestMethod -Uri "$baseUrl/api/tags" -TimeoutSec 3 | Out-Null; return $true }
    catch { return $false }
}
if (!(ServerReady)) {
    $command = Get-Command ollama -ErrorAction SilentlyContinue
    $binary = if ($command) { $command.Source } else { Join-Path $directory 'ollama.exe' }
    $installed = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (!(Test-Path -LiteralPath $binary) -and (Test-Path -LiteralPath $installed)) { $binary = $installed }
    if (!(Test-Path -LiteralPath $binary)) {
        Write-Host 'Downloading the official portable Ollama distribution...'
        $archive = Join-Path $directory 'ollama-windows-amd64.zip'
        Invoke-WebRequest -Uri 'https://github.com/ollama/ollama/releases/latest/download/ollama-windows-amd64.zip' -OutFile $archive -TimeoutSec 600
        Expand-Archive -LiteralPath $archive -DestinationPath $directory -Force
    }
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $env:OLLAMA_MODELS = Join-Path $directory 'models'
    $env:OLLAMA_NO_CLOUD = '1'
    $env:OLLAMA_NUM_PARALLEL = '1'
    $env:OLLAMA_MAX_LOADED_MODELS = '1'
    Start-Process -FilePath $binary -ArgumentList 'serve' -WindowStyle Hidden -WorkingDirectory $directory -RedirectStandardOutput (Join-Path $directory 'server.stdout.log') -RedirectStandardError (Join-Path $directory 'server.stderr.log') | Out-Null
    $deadline = (Get-Date).AddSeconds(45)
    while (!(ServerReady)) {
        if ((Get-Date) -gt $deadline) { throw 'Ollama did not start. Inspect .tools/ollama/server.stderr.log.' }
        Start-Sleep -Seconds 1
    }
}
Write-Host "Downloading/checking local model $Model (several GB on first use)..."
$pull = @{model=$Model;stream=$false} | ConvertTo-Json
$download = Invoke-RestMethod -Uri "$baseUrl/api/pull" -Method Post -ContentType 'application/json' -Body $pull -TimeoutSec 7200
if ($download.error) { throw $download.error }
$info = Invoke-RestMethod -Uri "$baseUrl/api/show" -Method Post -ContentType 'application/json' -Body (@{model=$Model} | ConvertTo-Json)
if ($info.capabilities -notcontains 'vision') { throw 'The selected model cannot inspect PDF images. Choose a vision model.' }
Write-Host 'Checking native structured JSON generation...'
$test = @{model=$Model;stream=$false;think=$false;format=@{type='object';properties=@{ok=@{type='boolean'}};required=@('ok');additionalProperties=$false};messages=@(@{role='user';content='Return JSON with ok set to true.'});options=@{temperature=0;num_predict=64;num_ctx=4096}} | ConvertTo-Json -Depth 12
$response = Invoke-RestMethod -Uri "$baseUrl/api/chat" -Method Post -ContentType 'application/json' -Body $test -TimeoutSec 300
$result = $response.message.content | ConvertFrom-Json
if ($result.ok -ne $true) { throw 'Local structured-output smoke test failed.' }
Write-Host 'Ollama is ready. Restart the platform with npm run dev. No API key is needed.'
