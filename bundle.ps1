<#
 Bundler: create a single-file HTML with inlined CSS/JS/assets
 Usage:
  powershell -ExecutionPolicy Bypass -File .\bundle.ps1

 Output: luck_single.html
#>

function Get-MimeType($path){
  $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  switch($ext){
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg'{ return 'image/jpeg' }
    '.gif' { return 'image/gif' }
    '.svg' { return 'image/svg+xml' }
    '.mp3' { return 'audio/mpeg' }
    '.wav' { return 'audio/wav' }
    default { return 'application/octet-stream' }
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$htmlPath = Join-Path $root 'luck.html'
$cssPath = Join-Path $root 'style.css'
$jsPath = Join-Path $root 'script.js'

if(-not (Test-Path $htmlPath)){ Write-Error 'luck.html not found in current folder.'; exit 1 }
if(-not (Test-Path $jsPath)){ Write-Error 'script.js not found in current folder.'; exit 1 }

$html = Get-Content $htmlPath -Raw
if(Test-Path $cssPath){ $css = Get-Content $cssPath -Raw } else { $css = '' }
$js = Get-Content $jsPath -Raw

# Find asset filenames referenced in JS (png/jpg/mp3/svg)
$assetRegex = '[\''"]([A-Za-z0-9_\- \.]+?\.(?:png|jpg|jpeg|gif|svg|mp3|wav))[\''"]'
$matches = [regex]::Matches($js, $assetRegex)
$assets = @{}
foreach($m in $matches){
  $fname = $m.Groups[1].Value
  if(-not $assets.ContainsKey($fname)){
    $fpath = Join-Path $root $fname
    if(Test-Path $fpath){
      $bytes = [System.IO.File]::ReadAllBytes($fpath)
      $b64 = [System.Convert]::ToBase64String($bytes)
      $mime = Get-MimeType $fpath
      $data = "data:$mime;base64,$b64"
      $assets[$fname] = $data
    } else {
      Write-Host "Warning: asset not found: $fname (left as-is)"
    }
  }
}

# Replace asset filenames in JS with data URIs where available
foreach($k in $assets.Keys){
  $quotedSingle = "'" + $k + "'"
  $quotedDouble = '"' + $k + '"'
  $js = $js -replace [regex]::Escape($quotedSingle), ("'" + $assets[$k] + "'")
  $js = $js -replace [regex]::Escape($quotedDouble), ('"' + $assets[$k] + '"')
}

# Inline CSS and JS into HTML
# remove existing <link rel="stylesheet" ...> and <script src=...> references to local files
$html = [regex]::Replace($html, '<link[^>]*href=["\"][^"\"]*style\.css["\"][^>]*>', "", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
$html = [regex]::Replace($html, '<script[^>]*src=["\"][^"\"]*script\.js["\"][^>]*></script>', "", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

# inject CSS before closing head
if($css -ne ''){ $styleTag = "<style>`n$css`n</style>" } else { $styleTag = '' }
$html = [regex]::Replace($html, '</head>', "$styleTag`n</head>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

# inject JS before closing body
$scriptTag = "<script>`n$js`n</script>"
$html = [regex]::Replace($html, '</body>', "$scriptTag`n</body>", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

$out = Join-Path $root 'luck_single.html'
Set-Content -Path $out -Value $html -Encoding UTF8
Write-Host "Created single-file HTML:" $out
