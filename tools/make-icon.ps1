# Draws the app icon ("two voices") and writes resources/icon.png + icon.ico.
# Run: powershell -ExecutionPolicy Bypass -File tools/make-icon.ps1
param([string]$Bg = "#2E4A3F", [string]$Lens = "#F3EEE6", [string]$PreviewOnly = "")
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot

function Draw-Icon([int]$px) {
  $bmp = New-Object System.Drawing.Bitmap $px, $px
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $px / 140.0   # design grid is 140 units
  function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([float]($x * $s)), ([float]($y * $s)) }
  function Circle([double]$cx, [double]$cy, [double]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddEllipse([float](($cx - $r) * $s), [float](($cy - $r) * $s), [float](2 * $r * $s), [float](2 * $r * $s)); $p
  }
  $cream = [System.Drawing.ColorTranslator]::FromHtml($Bg)
  $coral = [System.Drawing.ColorTranslator]::FromHtml('#D97757')
  $blue  = [System.Drawing.ColorTranslator]::FromHtml('#5B7FA6')
  $ink   = [System.Drawing.ColorTranslator]::FromHtml($Lens)

  # rounded-square background
  $r = 32 * $s; $w = 140 * $s
  $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bg.AddArc(0, 0, 2*$r, 2*$r, 180, 90); $bg.AddArc($w-2*$r, 0, 2*$r, 2*$r, 270, 90)
  $bg.AddArc($w-2*$r, $w-2*$r, 2*$r, 2*$r, 0, 90); $bg.AddArc(0, $w-2*$r, 2*$r, 2*$r, 90, 90); $bg.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush $cream), $bg)

  $coralB = New-Object System.Drawing.SolidBrush $coral
  $blueB = New-Object System.Drawing.SolidBrush $blue
  # left bubble + tail
  $g.FillPolygon($coralB, [System.Drawing.PointF[]]@((P 32 82), (P 18 110), (P 48 94)))
  $left = Circle 58 64 36
  $g.FillPath($coralB, $left)
  # right bubble + tail
  $g.FillPolygon($blueB, [System.Drawing.PointF[]]@((P 110 98), (P 122 124), (P 94 110)))
  $right = Circle 84 78 36
  $g.FillPath($blueB, $right)
  # overlap where both voices meet
  $g.SetClip($left)
  $g.FillPath((New-Object System.Drawing.SolidBrush $ink), $right)
  $g.Dispose()
  $bmp
}

function PngBytes($bmp) { $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); ,$ms.ToArray() }

if ($PreviewOnly) { (Draw-Icon 256).Save($PreviewOnly, [System.Drawing.Imaging.ImageFormat]::Png); return }
$big = Draw-Icon 512
$big.Save("$root\resources\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# .ico with PNG-compressed frames (supported since Windows Vista)
$sizes = 16, 24, 32, 48, 64, 128, 256
$frames = foreach ($sz in $sizes) { ,(PngBytes (Draw-Icon $sz)) }
$out = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter $out
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $d = if ($sizes[$i] -ge 256) { 0 } else { $sizes[$i] }
  $bw.Write([byte]$d); $bw.Write([byte]$d); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$frames[$i].Length); $bw.Write([uint32]$offset)
  $offset += $frames[$i].Length
}
foreach ($f in $frames) { $bw.Write($f) }
[IO.File]::WriteAllBytes("$root\icon.ico", $out.ToArray())
"wrote resources\icon.png and icon.ico"
