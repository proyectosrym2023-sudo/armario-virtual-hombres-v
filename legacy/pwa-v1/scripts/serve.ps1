# Servidor estático local para probar la PWA y los tests (sin Node ni Python).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Port 5173
param([int]$Port = 5173)
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
  '.webp' = 'image/webp'; '.jpg' = 'image/jpeg'; '.md' = 'text/plain; charset=utf-8'; '.sql' = 'text/plain; charset=utf-8'
}
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Port/")
$http.Start()
Write-Host "Sirviendo $raiz en http://localhost:$Port/"
while ($http.IsListening) {
  $ctx = $http.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
    $ruta = [IO.Path]::GetFullPath((Join-Path $raiz $rel))
    if (-not $ruta.StartsWith($raiz) -or -not (Test-Path $ruta -PathType Leaf)) {
      $res.StatusCode = 404; $b = [Text.Encoding]::UTF8.GetBytes('404'); $res.OutputStream.Write($b, 0, $b.Length)
    } else {
      $ext = [IO.Path]::GetExtension($ruta).ToLower()
      $res.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-cache')
      $b = [IO.File]::ReadAllBytes($ruta)
      $res.ContentLength64 = $b.Length
      $res.OutputStream.Write($b, 0, $b.Length)
    }
    Write-Host "$($res.StatusCode) $($ctx.Request.Url.AbsolutePath)"
  } catch { Write-Host "ERROR $_" } finally { $res.Close() }
}
