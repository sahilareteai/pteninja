Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\sahil\Downloads\pteninjasnaps"
$outShowcase = "play_store_assets\showcase_screenshots"
$outDirect = "play_store_assets\direct_screenshots"

if (-not (Test-Path $outShowcase)) { New-Item -ItemType Directory -Path $outShowcase | Out-Null }
if (-not (Test-Path $outDirect)) { New-Item -ItemType Directory -Path $outDirect | Out-Null }

$items = @(
    @{
        File = "eed5a939-ff0a-4814-b3d6-810b34ae0b45.jpg"
        Num = 1
        Tag = "FULL MOCK TESTS"
        Title = "500+ Full-Length Tests"
        Subtitle = "Exact Exam Structure * Timed Practice"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "ad6cf534-0a74-4195-b1fc-b95461c60fd1.jpg"
        Num = 2
        Tag = "SPEAKING PREPARATION"
        Title = "7 Specialized Task Types"
        Subtitle = "Read Aloud, Repeat Sentence & Speech AI"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "836a9e64-3367-481e-9ef2-fb4c342f562b.jpg"
        Num = 3
        Tag = "SMART ANALYTICS"
        Title = "In-Depth Training Analysis"
        Subtitle = "Detailed Section Scores & Instant Feedback"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "d223e400-088e-4ec9-afe4-f961662ae395.jpg"
        Num = 4
        Tag = "GOAL TRACKING"
        Title = "Personalized Study Plan"
        Subtitle = "Target 79+ or 65+ * Milestone Roadmap"
        IsDark = $true
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 8, 14, 20)
    },
    @{
        File = "74cd7a3e-7900-4159-9bd6-8782d308fb1e.jpg"
        Num = 5
        Tag = "WRITING MODULE"
        Title = "Essay & Summary Tasks"
        Subtitle = "1,000+ Real Exam Questions with AI Scoring"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "acf7bd8b-d818-4ec4-bb59-283983657832.jpg"
        Num = 6
        Tag = "READING PRACTICE"
        Title = "5 Reading Question Formats"
        Subtitle = "Fill in the Blanks, Re-order & MCQ"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "c7b5df78-fffc-4a5e-89d7-10a1a8c7ac8b.jpg"
        Num = 7
        Tag = "LISTENING MODULE"
        Title = "8 Listening Question Formats"
        Subtitle = "Summarize Spoken Text, Dictation & Blanks"
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "a0ccb0ad-f094-4cfc-b2bd-4c05df12698b.jpg"
        Num = 8
        Tag = "VOCABULARY DOJO"
        Title = "2,000+ Academic Words"
        Subtitle = "Master Essential PTE Vocabulary with Audio"
        IsDark = $true
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 8, 14, 20)
    }
)

$targetW = 1080
$targetH = 1920

# Helper function to create rounded rectangle path
function Get-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

foreach ($item in $items) {
    $filePath = Join-Path $srcDir $item.File
    if (-not (Test-Path $filePath)) {
        Write-Warning "File not found: $filePath"
        continue
    }

    $srcBmp = [System.Drawing.Bitmap]::FromFile($filePath)

    # ═════════════════════════════════════════════════════════════════════════
    # 1. BUILD SHOWCASE SCREENSHOT (1080 x 1920 with Header & Framed Device Card)
    # ═════════════════════════════════════════════════════════════════════════
    $showBmp = New-Object System.Drawing.Bitmap($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($showBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background gradient
    $bgGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)),
        $item.ThemeBg,
        [System.Drawing.Color]::FromArgb(255, 4, 8, 12),
        90.0
    )
    $g.FillRectangle($bgGrad, 0, 0, $targetW, $targetH)
    $bgGrad.Dispose()

    # Subtle cyan accent wave in background
    $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 45, 212, 191), 2.0)
    $wavePts = @(
        (New-Object System.Drawing.Point(0, 180)),
        (New-Object System.Drawing.Point(360, 320)),
        (New-Object System.Drawing.Point(720, 160)),
        (New-Object System.Drawing.Point(1080, 260))
    )
    $g.DrawCurve($accentPen, $wavePts, 0.6)
    $accentPen.Dispose()

    # Header Typography
    $fontFamily = "Segoe UI"
    $tagFont = New-Object System.Drawing.Font($fontFamily, 14, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font($fontFamily, 36, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font($fontFamily, 17, [System.Drawing.FontStyle]::Regular)

    $tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 212, 191))
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))

    # Center-aligned text
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString($item.Tag.ToUpper(), $tagFont, $tagBrush, ($targetW / 2), 65, $sf)
    $g.DrawString($item.Title, $titleFont, $titleBrush, ($targetW / 2), 105, $sf)
    $g.DrawString($item.Subtitle, $subFont, $subBrush, ($targetW / 2), 170, $sf)

    $tagFont.Dispose()
    $titleFont.Dispose()
    $subFont.Dispose()
    $tagBrush.Dispose()
    $titleBrush.Dispose()
    $subBrush.Dispose()
    $sf.Dispose()

    # Framed Device Card
    # Let screenshot height be 1640 px
    $cardH = 1660
    $cardW = [int]($cardH * ($srcBmp.Width / $srcBmp.Height))
    if ($cardW -gt 920) {
        $cardW = 920
        $cardH = [int]($cardW * ($srcBmp.Height / $srcBmp.Width))
    }
    $cardX = [int](($targetW - $cardW) / 2)
    $cardY = 240
    $radius = 28.0

    # Card drop shadow simulation
    for ($s = 10; $s -ge 1; $s--) {
        $sAlpha = [int](5 + (10 - $s) * 2)
        $sPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($sAlpha, 0, 0, 0), ($s * 2))
        $sPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $sPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $sRect = Get-RoundedRect ($cardX - $s) ($cardY - $s) ($cardW + $s*2) ($cardH + $s*2) ($radius + $s)
        $g.DrawPath($sPen, $sRect)
        $sPen.Dispose()
        $sRect.Dispose()
    }

    # Draw rounded clipped screenshot
    $clip = Get-RoundedRect $cardX $cardY $cardW $cardH $radius
    $g.SetClip($clip)
    $g.DrawImage($srcBmp, $cardX, $cardY, $cardW, $cardH)
    $g.ResetClip()

    # Border stroke around the phone card
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 45, 212, 191), 2.5)
    $g.DrawPath($borderPen, $clip)
    $borderPen.Dispose()
    $clip.Dispose()

    $showName = "screenshot_$($item.Num)_$($item.Tag.ToLower() -replace ' ', '_')"
    $showDestPng = Join-Path $outShowcase "$showName.png"
    $showDestJpg = Join-Path $outShowcase "$showName.jpg"
    $showBmp.Save($showDestPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $showBmp.Save($showDestJpg, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $g.Dispose()
    $showBmp.Dispose()

    # ═════════════════════════════════════════════════════════════════════════
    # 2. BUILD DIRECT CLEAN FIT SCREENSHOT (Pure 9:16 aspect ratio fit, no text)
    # ═════════════════════════════════════════════════════════════════════════
    $dirBmp = New-Object System.Drawing.Bitmap($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g2 = [System.Drawing.Graphics]::FromImage($dirBmp)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g2.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Sample top pixel from the screenshot for seamless top & side color
    $topColor = $srcBmp.GetPixel(10, 10)
    $fillBrush = New-Object System.Drawing.SolidBrush($topColor)
    $g2.FillRectangle($fillBrush, 0, 0, $targetW, $targetH)
    $fillBrush.Dispose()

    # Scale screenshot to fit height 1920
    $scaledH = $targetH
    $scaledW = [int]($scaledH * ($srcBmp.Width / $srcBmp.Height))
    $scaledX = [int](($targetW - $scaledW) / 2)
    $scaledY = 0

    $g2.DrawImage($srcBmp, $scaledX, $scaledY, $scaledW, $scaledH)

    $dirName = "screenshot_$($item.Num)_direct"
    $dirDestPng = Join-Path $outDirect "$dirName.png"
    $dirDestJpg = Join-Path $outDirect "$dirName.jpg"
    $dirBmp.Save($dirDestPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $dirBmp.Save($dirDestJpg, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $g2.Dispose()
    $dirBmp.Dispose()
    $srcBmp.Dispose()

    Write-Output "Processed [$($item.Num)/8]: $($item.Title)"
}

Write-Output "All 8 screenshots converted successfully!"
