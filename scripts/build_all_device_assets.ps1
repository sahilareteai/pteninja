Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\sahil\Downloads\pteninjasnaps"
$baseOut = "play_store_assets"

$tablet7Dir = Join-Path $baseOut "tablet_7inch_screenshots"
$tablet10Dir = Join-Path $baseOut "tablet_10inch_screenshots"
$desktopDir = Join-Path $baseOut "desktop_screenshots"
$xrDir = Join-Path $baseOut "android_xr_screenshots"

foreach ($dir in @($tablet7Dir, $tablet10Dir, $desktopDir, $xrDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

$items = @(
    @{
        File = "eed5a939-ff0a-4814-b3d6-810b34ae0b45.jpg"
        Num = 1
        Tag = "EXAM SIMULATION"
        Title = "500+ Full-Length Mock Tests"
        Subtitle = "Full PTE test simulation with exact exam timing"
        Bullets = @(
            "130-Minute Full Exam Simulation",
            "61 Real Exam-Predicted Tasks",
            "AI Scoring Aligned with 10-90 Scale"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "ad6cf534-0a74-4195-b1fc-b95461c60fd1.jpg"
        Num = 2
        Tag = "SPEAKING PROFICIENCY"
        Title = "7 Specialized Speaking Tasks"
        Subtitle = "Master Read Aloud, Repeat Sentence & More"
        Bullets = @(
            "Real-Time Speech AI & Pronunciation Analysis",
            "Fluency & Oral Clarity Diagnostics",
            "Thousands of Recent Exam Questions"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "836a9e64-3367-481e-9ef2-fb4c342f562b.jpg"
        Num = 3
        Tag = "SMART ANALYTICS"
        Title = "Comprehensive Training Analytics"
        Subtitle = "Understand your strengths & pinpoint weaknesses"
        Bullets = @(
            "Live Section Breakdown for All 4 Skills",
            "Targeted Weakness Detection & Improvement",
            "Real-Time Progress Tracking Toward Your Goal"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "d223e400-088e-4ec9-afe4-f961662ae395.jpg"
        Num = 4
        Tag = "PERSONALIZED PREPARATION"
        Title = "Target Score & Study Plan"
        Subtitle = "Your customized roadmap to Target 79+ or 65+"
        Bullets = @(
            "Custom Goal Setting on 10-90 Scale",
            "Exam Date Countdown & Daily Targets",
            "Gamified Belt Progression (White to Black Belt)"
        )
        IsDark = $true
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 8, 14, 20)
    },
    @{
        File = "74cd7a3e-7900-4159-9bd6-8782d308fb1e.jpg"
        Num = 5
        Tag = "WRITING MASTERY"
        Title = "Essay & Summary Tasks"
        Subtitle = "1,000+ real exam questions with instant AI feedback"
        Bullets = @(
            "Grammar, Vocabulary & Structure AI Scoring",
            "Spelling & Form Score Breakdown",
            "Proven Templates & Model Answers"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "acf7bd8b-d818-4ec4-bb59-283983657832.jpg"
        Num = 6
        Tag = "READING PROFICIENCY"
        Title = "5 Reading Question Formats"
        Subtitle = "Fill in the Blanks, Re-order Paragraphs & MCQ"
        Bullets = @(
            "Collocation & Context Clue Guidance",
            "Time Management Strategies per Question",
            "Over 1,000 Exam-Verified Questions"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "c7b5df78-fffc-4a5e-89d7-10a1a8c7ac8b.jpg"
        Num = 7
        Tag = "LISTENING PROFICIENCY"
        Title = "8 Listening Question Formats"
        Subtitle = "Summarize Spoken Text, Dictation & Blanks"
        Bullets = @(
            "Authentic Multi-Accent Native English Audio",
            "Write from Dictation High-Yield Practice",
            "Instant Word-by-Word Accuracy Scoring"
        )
        IsDark = $false
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "a0ccb0ad-f094-4cfc-b2bd-4c05df12698b.jpg"
        Num = 8
        Tag = "VOCABULARY DOJO"
        Title = "2,000+ Academic Words"
        Subtitle = "High-frequency academic collocations & vocabulary"
        Bullets = @(
            "Crystal-Clear Audio Pronunciation",
            "Definitions, Word Forms & Example Context",
            "Favorites & Spaced Repetition Review"
        )
        IsDark = $true
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 8, 14, 20)
    }
)

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

# ═════════════════════════════════════════════════════════════════════════════
# 1. 7-INCH & 10-INCH TABLETS: High-Resolution 9:16 Portrait (1080 x 1920)
# Copy verified showcase screenshots to tablet folders
# ═════════════════════════════════════════════════════════════════════════════
Write-Output "Processing 7-inch and 10-inch Tablet Assets..."
$phoneShowcaseDir = "play_store_assets\showcase_screenshots"

Get-ChildItem -Path $phoneShowcaseDir -Filter "*.png" | ForEach-Object {
    $dest7 = Join-Path $tablet7Dir $_.Name
    $dest10 = Join-Path $tablet10Dir $_.Name
    Copy-Item $_.FullName $dest7 -Force
    Copy-Item $_.FullName $dest10 -Force
}
Get-ChildItem -Path $phoneShowcaseDir -Filter "*.jpg" | ForEach-Object {
    $dest7 = Join-Path $tablet7Dir $_.Name
    $dest10 = Join-Path $tablet10Dir $_.Name
    Copy-Item $_.FullName $dest7 -Force
    Copy-Item $_.FullName $dest10 -Force
}
Write-Output "Populated 7-inch and 10-inch tablet assets."

# ═════════════════════════════════════════════════════════════════════════════
# 2. DESKTOP & ANDROID XR: 16:9 Landscape Widescreen (1920 x 1080) Showcase
# ═════════════════════════════════════════════════════════════════════════════
Write-Output "Building 16:9 Landscape Assets for Desktop and Android XR..."

$deskW = 1920
$deskH = 1080

foreach ($item in $items) {
    $filePath = Join-Path $srcDir $item.File
    if (-not (Test-Path $filePath)) { continue }

    $srcBmp = [System.Drawing.Bitmap]::FromFile($filePath)

    $bmp = New-Object System.Drawing.Bitmap($deskW, $deskH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background gradient
    $bgGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $deskW, $deskH)),
        $item.ThemeBg,
        [System.Drawing.Color]::FromArgb(255, 6, 10, 16),
        35.0
    )
    $g.FillRectangle($bgGrad, 0, 0, $deskW, $deskH)
    $bgGrad.Dispose()

    # Flowing decorative accent curves
    $wavePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(30, 45, 212, 191), 2.0)
    $wavePts = @(
        (New-Object System.Drawing.Point(0, 220)),
        (New-Object System.Drawing.Point(500, 750)),
        (New-Object System.Drawing.Point(1100, 180)),
        (New-Object System.Drawing.Point(1920, 680))
    )
    $g.DrawCurve($wavePen, $wavePts, 0.6)
    $wavePen.Dispose()

    # Ambient radial glow behind the phone on right side
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(1150, 80, 700, 900)
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(35, 45, 212, 191)
    $glowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 6, 10, 16))
    $g.FillPath($glowBrush, $glowPath)
    $glowPath.Dispose()
    $glowBrush.Dispose()

    # ── Left Column: Typography & Feature Highlights ──
    $fontFamily = "Segoe UI"
    $brandFont = New-Object System.Drawing.Font($fontFamily, 14, [System.Drawing.FontStyle]::Bold)
    $tagFont = New-Object System.Drawing.Font($fontFamily, 15, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font($fontFamily, 44, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font($fontFamily, 20, [System.Drawing.FontStyle]::Regular)
    $bulletFont = New-Object System.Drawing.Font($fontFamily, 18, [System.Drawing.FontStyle]::Regular)
    $checkFont = New-Object System.Drawing.Font($fontFamily, 18, [System.Drawing.FontStyle]::Bold)

    $brandBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 212, 191))
    $tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 45, 212, 191))
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
    $bulletBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
    $checkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 52, 211, 153))

    $leftX = 140

    # Brand badge
    $g.DrawString("PTE NINJA  *  OFFICIAL STORE EDITION", $brandFont, $brandBrush, $leftX, 140)

    # Category Tag
    $g.DrawString($item.Tag.ToUpper(), $tagFont, $tagBrush, $leftX, 185)

    # Big Title
    $titleRect = New-Object System.Drawing.RectangleF($leftX, 230, 950, 140)
    $g.DrawString($item.Title, $titleFont, $titleBrush, $titleRect)

    # Subtitle
    $subRect = New-Object System.Drawing.RectangleF($leftX, 385, 950, 80)
    $g.DrawString($item.Subtitle, $subFont, $subBrush, $subRect)

    # Bullet Points with elegant circular badges
    $bY = 490
    foreach ($bullet in $item.Bullets) {
        $g.FillEllipse($checkBrush, $leftX, ($bY + 8), 10, 10)
        $g.DrawString($bullet, $bulletFont, $bulletBrush, ($leftX + 30), $bY)
        $bY += 65
    }

    # Bottom pill badge (100% trademark-compliant without Pearson keyword)
    $footFont = New-Object System.Drawing.Font($fontFamily, 13, [System.Drawing.FontStyle]::Bold)
    $footBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 45, 212, 191))
    $g.DrawString("OFFICIAL 10-90 SCALE ALIGNED  *  INSTANT AI SCORING & FEEDBACK", $footFont, $footBrush, $leftX, 740)
    $footFont.Dispose()
    $footBrush.Dispose()

    # Cleanup left typography resources
    $brandFont.Dispose(); $tagFont.Dispose(); $titleFont.Dispose(); $subFont.Dispose()
    $bulletFont.Dispose(); $checkFont.Dispose()
    $brandBrush.Dispose(); $tagBrush.Dispose(); $titleBrush.Dispose(); $subBrush.Dispose()
    $bulletBrush.Dispose(); $checkBrush.Dispose()

    # ── Right Column: Framed Device Mockup ──
    $cardH = 920
    $cardW = [int]($cardH * ($srcBmp.Width / $srcBmp.Height))
    $cardX = 1320
    $cardY = [int](($deskH - $cardH) / 2)
    $radius = 24.0

    # Soft drop shadow
    for ($s = 10; $s -ge 1; $s--) {
        $sAlpha = [int](6 + (10 - $s) * 2)
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

    # Elegant glowing rim border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(85, 45, 212, 191), 2.5)
    $g.DrawPath($borderPen, $clip)
    $borderPen.Dispose()
    $clip.Dispose()

    # Save to Desktop and XR directories
    $fName = "desktop_screenshot_$($item.Num)_$($item.Tag.ToLower() -replace ' ', '_')"
    $destDeskPng = Join-Path $desktopDir "$fName.png"
    $destDeskJpg = Join-Path $desktopDir "$fName.jpg"
    $bmp.Save($destDeskPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($destDeskJpg, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $xrName = "xr_screenshot_$($item.Num)_$($item.Tag.ToLower() -replace ' ', '_')"
    $destXrPng = Join-Path $xrDir "$xrName.png"
    $destXrJpg = Join-Path $xrDir "$xrName.jpg"
    $bmp.Save($destXrPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Save($destXrJpg, [System.Drawing.Imaging.ImageFormat]::Jpeg)

    $g.Dispose()
    $bmp.Dispose()
    $srcBmp.Dispose()

    Write-Output "Generated Desktop & XR [$($item.Num)/8]: $($item.Title)"
}

Write-Output "All device assets generated successfully!"
