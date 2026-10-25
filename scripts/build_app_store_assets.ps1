Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\sahil\Downloads\pteninjasnaps"
$appStoreBase = "app_store_assets"
$fastlaneScreenshotsDir = "ios\App\fastlane\screenshots\en-US"

$dirs = @(
    (Join-Path $appStoreBase "iphone_6_7_1290x2796"),
    (Join-Path $appStoreBase "iphone_6_5_1242x2688"),
    (Join-Path $appStoreBase "ipad_12_9_2048x2732"),
    $fastlaneScreenshotsDir
)

foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}

$items = @(
    @{
        File = "eed5a939-ff0a-4814-b3d6-810b34ae0b45.jpg"
        Num = 1
        Tag = "EXAM SIMULATION"
        Title = "500+ Full-Length Mock Tests"
        Subtitle = "Authentic test simulator with PTE 10-90 scale scoring"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "ad6cf534-0a74-4195-b1fc-b95461c60fd1.jpg"
        Num = 2
        Tag = "AI SPEECH ENGINE"
        Title = "Real-Time Phoneme Analysis"
        Subtitle = "Instant diagnostics for Fluency, Pronunciation and Clarity"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "836a9e64-3367-481e-9ef2-fb4c342f562b.jpg"
        Num = 3
        Tag = "SMART ANALYTICS"
        Title = "In-Depth Skill Diagnostics"
        Subtitle = "Real-time scorecard with section breakdowns"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "d223e400-088e-4ec9-afe4-f961662ae395.jpg"
        Num = 4
        Tag = "GOAL TRACKING"
        Title = "Personalized Study Roadmap"
        Subtitle = "Custom target milestones for 65+ and 79+ goals"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 8, 14, 20)
    },
    @{
        File = "74cd7a3e-7900-4159-9bd6-8782d308fb1e.jpg"
        Num = 5
        Tag = "WRITING MODULE"
        Title = "Essay and Summary Tasks"
        Subtitle = "AI evaluations for Grammar, Vocabulary and Structure"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "acf7bd8b-d818-4ec4-bb59-283983657832.jpg"
        Num = 6
        Tag = "READING PRACTICE"
        Title = "5 Reading Question Formats"
        Subtitle = "Fill in the Blanks, Re-order and Multiple Choice"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "0df1cec6-e8b5-420e-8292-ec8ee454f279.jpg"
        Num = 7
        Tag = "LISTENING MASTERY"
        Title = "Real Audio Lectures"
        Subtitle = "Summarize Spoken Text, Dictation and Missing Words"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    },
    @{
        File = "00050d8f-3475-4e8e-8b6c-9290b698b5e9.jpg"
        Num = 8
        Tag = "VOCABULARY DOJO"
        Title = "Academic Word List"
        Subtitle = "Collocations and high-yield test flashcards"
        ThemeBg = [System.Drawing.Color]::FromArgb(255, 10, 20, 28)
    }
)

function Get-RoundedRect {
    param([float]$x, [float]$y, [float]$w, [float]$h, [float]$r)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2.0
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc(($x + $w - $d), $y, $d, $d, 270, 90)
    $path.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90)
    $path.AddArc($x, ($y + $h - $d), $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Build-StoreFrame {
    param(
        [System.Drawing.Image]$srcBmp,
        [int]$targetW,
        [int]$targetH,
        [hashtable]$item
    )

    $bmp = New-Object System.Drawing.Bitmap($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background gradient
    $bgGrad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)),
        $item.ThemeBg,
        [System.Drawing.Color]::FromArgb(255, 6, 10, 15),
        90.0
    )
    $g.FillRectangle($bgGrad, 0, 0, $targetW, $targetH)
    $bgGrad.Dispose()

    # Subtle cyan accent wave in background
    $accentPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 69, 162, 158), 3.0)
    $wavePts = @(
        (New-Object System.Drawing.Point(0, [int]($targetH * 0.12))),
        (New-Object System.Drawing.Point([int]($targetW * 0.35), [int]($targetH * 0.18))),
        (New-Object System.Drawing.Point([int]($targetW * 0.7), [int]($targetH * 0.10))),
        (New-Object System.Drawing.Point($targetW, [int]($targetH * 0.15)))
    )
    $g.DrawCurve($accentPen, $wavePts, 0.6)
    $accentPen.Dispose()

    # Header Typography scale based on width
    $scale = $targetW / 1080.0
    $tagFontSize = [int](14 * $scale)
    $titleFontSize = [int](36 * $scale)
    $subFontSize = [int](17 * $scale)

    $fontFamily = "Segoe UI"
    $tagFont = New-Object System.Drawing.Font($fontFamily, $tagFontSize, [System.Drawing.FontStyle]::Bold)
    $titleFont = New-Object System.Drawing.Font($fontFamily, $titleFontSize, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font($fontFamily, $subFontSize, [System.Drawing.FontStyle]::Regular)

    $tagBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 102, 252, 241)) # #66FCF1
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 197, 198, 199)) # #C5C6C7

    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center

    $tagY = [int](70 * $scale)
    $titleY = [int]($tagY + (42 * $scale))
    $subY = [int]($titleY + (68 * $scale))

    $g.DrawString($item.Tag.ToUpper(), $tagFont, $tagBrush, ($targetW / 2), $tagY, $sf)
    $g.DrawString($item.Title, $titleFont, $titleBrush, ($targetW / 2), $titleY, $sf)
    $g.DrawString($item.Subtitle, $subFont, $subBrush, ($targetW / 2), $subY, $sf)

    $tagFont.Dispose(); $titleFont.Dispose(); $subFont.Dispose()
    $tagBrush.Dispose(); $titleBrush.Dispose(); $subBrush.Dispose()
    $sf.Dispose()

    # Device Card Dimensions
    $cardTopY = [int]($subY + (60 * $scale))
    $cardAvailableH = $targetH - $cardTopY + 40
    $cardMaxW = [int]($targetW * 0.86)

    $aspect = $srcBmp.Width / $srcBmp.Height
    $cardW = [int]($cardAvailableH * $aspect)
    if ($cardW -gt $cardMaxW) {
        $cardW = $cardMaxW
        $cardH = [int]($cardW / $aspect)
    } else {
        $cardH = $cardAvailableH
    }

    $cardX = [int](($targetW - $cardW) / 2)
    $cardY = $cardTopY
    $radius = [float](28.0 * $scale)

    # Card shadow
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

    # Border stroke around the device frame
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 69, 162, 158), (2.5 * $scale))
    $g.DrawPath($borderPen, $clip)
    $borderPen.Dispose()
    $clip.Dispose()

    $g.Dispose()
    return $bmp
}

Write-Output "Processing Apple App Store Screenshots..."

foreach ($item in $items) {
    $srcPath = Join-Path $srcDir $item.File
    if (-not (Test-Path $srcPath)) {
        Write-Warning "Source file not found: $srcPath"
        continue
    }

    $srcBmp = [System.Drawing.Image]::FromFile($srcPath)
    Write-Output "Generating assets for [$($item.Num)] $($item.Tag)..."

    # 1. 6.7" / 6.9" Display: 1290 x 2796
    $img67 = Build-StoreFrame $srcBmp 1290 2796 $item
    $dest67 = Join-Path $appStoreBase "iphone_6_7_1290x2796\screenshot_$($item.Num).png"
    $img67.Save($dest67, [System.Drawing.Imaging.ImageFormat]::Png)
    $fastlane67 = Join-Path $fastlaneScreenshotsDir "APP_IPHONE_67_$($item.Num).png"
    $img67.Save($fastlane67, [System.Drawing.Imaging.ImageFormat]::Png)
    $img67.Dispose()

    # 2. 6.5" Display: 1242 x 2688
    $img65 = Build-StoreFrame $srcBmp 1242 2688 $item
    $dest65 = Join-Path $appStoreBase "iphone_6_5_1242x2688\screenshot_$($item.Num).png"
    $img65.Save($dest65, [System.Drawing.Imaging.ImageFormat]::Png)
    $fastlane65 = Join-Path $fastlaneScreenshotsDir "APP_IPHONE_65_$($item.Num).png"
    $img65.Save($fastlane65, [System.Drawing.Imaging.ImageFormat]::Png)
    $img65.Dispose()

    # 3. 12.9" iPad Pro Display: 2048 x 2732
    $imgPad = Build-StoreFrame $srcBmp 2048 2732 $item
    $destPad = Join-Path $appStoreBase "ipad_12_9_2048x2732\screenshot_$($item.Num).png"
    $imgPad.Save($destPad, [System.Drawing.Imaging.ImageFormat]::Png)
    $fastlanePad = Join-Path $fastlaneScreenshotsDir "APP_IPAD_PRO_3GEN_129_$($item.Num).png"
    $imgPad.Save($fastlanePad, [System.Drawing.Imaging.ImageFormat]::Png)
    $imgPad.Dispose()

    $srcBmp.Dispose()
}

Write-Output "All Apple App Store screenshots built successfully!"
