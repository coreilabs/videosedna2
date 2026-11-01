param(
    [string]$FFmpeg = 'ffmpeg',
    [ValidateRange(0, 86400)][double]$AtSeconds = 1,
    [Alias("MaxSize")][ValidateRange(32, 320)][int]$MaxWidth = 320,
    [string]$Only,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'gallery'
$destination = Join-Path $root 'thumbnails'
if (-not (Get-Command $FFmpeg -ErrorAction SilentlyContinue)) {
    throw 'FFmpeg nao encontrado. Instale: winget install --id Gyan.FFmpeg -e --source winget. Reabra o terminal ou informe -FFmpeg C:\caminho\ffmpeg.exe'
}
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'Pasta gallery nao encontrada.' }
$null = New-Item -ItemType Directory -Path $destination -Force
$videos = @(Get-ChildItem -LiteralPath $source -File | Where-Object {
    $_.Extension -match '^\.(mp4|mov|m4v|webm)$' -and (-not $Only -or $_.Name -eq $Only)
} | Sort-Object Name)
if ($videos.Count -eq 0) { throw 'Nenhum video encontrado para os criterios informados.' }
$created = 0; $skipped = 0; $failed = @()
# Even dimensions for WebP, close to the 9:16 gallery canvas.
$canvasWidth = [int]([math]::Floor($MaxWidth / 2) * 2)
$canvasHeight = [int]([math]::Ceiling($canvasWidth * 16 / 9 / 2) * 2)
foreach ($video in $videos) {
    # Include the original extension to avoid collisions between foo.mp4 and foo.mov.
    $target = Join-Path $destination ($video.Name + '.webp')
    if (-not $Force -and (Test-Path -LiteralPath $target)) {
        $existing = Get-Item -LiteralPath $target
        if ($existing.Length -gt 0 -and $existing.LastWriteTimeUtc -ge $video.LastWriteTimeUtc) {
            $skipped++; continue
        }
    }
    $temporary = Join-Path $destination (([guid]::NewGuid().ToString('N')) + '.tmp.webp')
    # Fit the whole frame. Landscape and non-9:16 videos receive padding, never cropping.
    $filter = "scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:color=0x201b18"
    $success = $false
    try {
        # Retry from the start for very short videos. Never modify the source.
        foreach ($position in @($AtSeconds, 0) | Select-Object -Unique) {
            $seek = $position.ToString([System.Globalization.CultureInfo]::InvariantCulture)
            $arguments = @('-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-ss', $seek,
                '-i', $video.FullName, '-map', '0:v:0', '-frames:v', '1', '-vf', $filter,
                '-c:v', 'libwebp', '-quality', '80', '-pix_fmt', 'yuv420p', '-threads', '1', '-update', '1', $temporary)
            & $FFmpeg @arguments
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $temporary) -and (Get-Item -LiteralPath $temporary).Length -gt 0) {
                Move-Item -LiteralPath $temporary -Destination $target -Force
                $created++; $success = $true; break
            }
        }
        if (-not $success) { $failed += $video.Name }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
    Write-Host "Processados $($created + $skipped + $failed.Count)/$($videos.Count)"
}
Write-Host "Geradas: $created | Preservadas: $skipped | Falhas: $($failed.Count)"
if ($failed.Count -gt 0) {
    $failed | ForEach-Object { Write-Warning "Sem miniatura: $_ (verifique se possui faixa de video valida)." }
    exit 1
}
