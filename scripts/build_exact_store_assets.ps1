Add-Type -AssemblyName System.Drawing

$logoPath = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\.user_uploaded\media_1792841287567.png"
$outputDir = "play_store_assets"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$logo = [System.Drawing.Bitmap]::FromFile($logoPath)
$innerColor = $logo.GetPixel(178, 30)
Write-Output "Inner circle color: R=$($innerColor.R) G=$($innerColor.G) B=$($innerColor.B)"

# ─── 1. Build 512x512 App Icon ───
$iconSize = 512
$iconBmp = New-Object System.Drawing.Bitmap($iconSize, $iconSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($iconBmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# Fill the entire 512x512 background with the exact inner dark color of the icon
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, $innerColor.R, $innerColor.G, $innerColor.B))
$g.FillRectangle($bgBrush, 0, 0, $iconSize, $iconSize)

# Subtle ambient radial glow in the center
$centerGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$centerGlowPath.AddEllipse(60, 60, 392, 392)
$centerGlowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($centerGlowPath)
$centerGlowBrush.CenterColor = [System.Drawing.Color]::FromArgb(35, 45, 212, 191)
$centerGlowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, $innerColor.R, $innerColor.G, $innerColor.B))
$g.FillPath($centerGlowBrush, $centerGlowPath)
$centerGlowPath.Dispose()
$centerGlowBrush.Dispose()

# Clip to circle to remove any outer dark square corners from the source image
$logoDrawSize = 440
$logoX = [int](($iconSize - $logoDrawSize) / 2)
$logoY = [int](($iconSize - $logoDrawSize) / 2)

$clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$clipPath.AddEllipse($logoX, $logoY, $logoDrawSize, $logoDrawSize)
$g.SetClip($clipPath)
$g.DrawImage($logo, $logoX, $logoY, $logoDrawSize, $logoDrawSize)
$g.ResetClip()
$clipPath.Dispose()

# Subtle outer cyan rim ring
$rimPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(75, 45, 212, 191), 2.5)
$g.DrawEllipse($rimPen, ($logoX + 1), ($logoY + 1), ($logoDrawSize - 2), ($logoDrawSize - 2))
$rimPen.Dispose()

$iconDestPath = "$outputDir\app_icon_512x512.png"
$iconBmp.Save($iconDestPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Saved 512x512 icon to $iconDestPath"

$g.Dispose()
$iconBmp.Dispose()

# ─── 2. Build 1024x500 Feature Graphic ───
$featWidth = 1024
$featHeight = 500
$featBmp = New-Object System.Drawing.Bitmap($featWidth, $featHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g2 = [System.Drawing.Graphics]::FromImage($featBmp)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g2.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Deep rich dark gradient background
$gradRect = New-Object System.Drawing.Rectangle(0, 0, $featWidth, $featHeight)
$gradColor1 = [System.Drawing.Color]::FromArgb(255, 14, 20, 28)
$gradColor2 = [System.Drawing.Color]::FromArgb(255, 8, 12, 18)
$linearBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($gradRect, $gradColor1, $gradColor2, 45.0)
$g2.FillRectangle($linearBrush, $gradRect)

# Elegant flowing waves
$cyanPen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 45, 212, 191), 2.5)
$cyanPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(25, 20, 184, 166), 1.8)

$curve1 = @(
    (New-Object System.Drawing.Point(0, 110)),
    (New-Object System.Drawing.Point(260, 420)),
    (New-Object System.Drawing.Point(540, 85)),
    (New-Object System.Drawing.Point(820, 395)),
    (New-Object System.Drawing.Point(1024, 210))
)
$g2.DrawCurve($cyanPen1, $curve1, 0.6)

$curve2 = @(
    (New-Object System.Drawing.Point(0, 380)),
    (New-Object System.Drawing.Point(280, 105)),
    (New-Object System.Drawing.Point(580, 435)),
    (New-Object System.Drawing.Point(840, 95)),
    (New-Object System.Drawing.Point(1024, 335))
)
$g2.DrawCurve($cyanPen2, $curve2, 0.7)

# Ambient soft glow behind the logo
$logoGlowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$logoGlowPath.AddEllipse(80, 75, 340, 340)
$logoGlowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($logoGlowPath)
$logoGlowBrush.CenterColor = [System.Drawing.Color]::FromArgb(45, 45, 212, 191)
$logoGlowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 8, 12, 18))
$g2.FillPath($logoGlowBrush, $logoGlowPath)
$logoGlowPath.Dispose()
$logoGlowBrush.Dispose()

# Draw the circular logo cleanly without dark corners
$featLogoSize = 310
$featLogoX = 100
$featLogoY = [int](($featHeight - $featLogoSize) / 2)

$featClip = New-Object System.Drawing.Drawing2D.GraphicsPath
$featClip.AddEllipse($featLogoX, $featLogoY, $featLogoSize, $featLogoSize)
$g2.SetClip($featClip)
$g2.DrawImage($logo, $featLogoX, $featLogoY, $featLogoSize, $featLogoSize)
$g2.ResetClip()
$featClip.Dispose()

# Glowing border ring around the circular logo
$logoBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 45, 212, 191), 3.0)
$g2.DrawEllipse($logoBorderPen, ($featLogoX + 1), ($featLogoY + 1), ($featLogoSize - 2), ($featLogoSize - 2))
$logoBorderPen.Dispose()

# Typography on the right side
$fontFamily = "Segoe UI"
$titleFont = New-Object System.Drawing.Font($fontFamily, 44, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font($fontFamily, 19, [System.Drawing.FontStyle]::Bold)
$tagFont = New-Object System.Drawing.Font($fontFamily, 13, [System.Drawing.FontStyle]::Regular)
$badgeFont = New-Object System.Drawing.Font($fontFamily, 12, [System.Drawing.FontStyle]::Bold)
$footFont = New-Object System.Drawing.Font($fontFamily, 11, [System.Drawing.FontStyle]::Bold)

$textStartX = 475

$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$cyanBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 45, 212, 191))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 148, 163, 184))
$footBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(210, 45, 212, 191))

# Title
$g2.DrawString("PTE NINJA", $titleFont, $cyanBrush, $textStartX, 105)

# Subtitle
$g2.DrawString("AI-Powered Exam Preparation", $subFont, $titleBrush, $textStartX, 180)

# Tagline (Using legally compliant and safe phrasing without claiming official Pearson endorsement)
$g2.DrawString("Exam-Standard AI Scoring  *  Full Mock Tests  *  Speech AI", $tagFont, $mutedBrush, $textStartX, 226)

# 4 Section Badges
$skills = @("Speaking", "Writing", "Reading", "Listening")
$badgeX = $textStartX
$badgeY = 280
$badgeHeight = 36
$badgePadding = 18

foreach ($s in $skills) {
    $size = $g2.MeasureString($s, $badgeFont)
    $badgeWidth = [int]($size.Width + ($badgePadding * 2))
    
    $bBgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 45, 212, 191))
    $bBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 45, 212, 191), 1.0)
    $bRect = New-Object System.Drawing.Rectangle($badgeX, $badgeY, $badgeWidth, $badgeHeight)
    
    $g2.FillRectangle($bBgBrush, $bRect)
    $g2.DrawRectangle($bBorderPen, $bRect)
    
    $bTextBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
    $g2.DrawString($s, $badgeFont, $bTextBrush, ($badgeX + $badgePadding), ($badgeY + 8))
    
    $badgeX += ($badgeWidth + 12)
    
    $bBgBrush.Dispose()
    $bBorderPen.Dispose()
    $bTextBrush.Dispose()
}

# Target highlight
$g2.DrawString("TARGET 79+ / 65+  *  REAL EXAM-PREDICTED QUESTIONS", $footFont, $footBrush, $textStartX, 350)

# Save Feature Graphic PNG & JPG
$featDestPng = "$outputDir\feature_graphic_1024x500.png"
$featDestJpg = "$outputDir\feature_graphic_1024x500.jpg"
$featBmp.Save($featDestPng, [System.Drawing.Imaging.ImageFormat]::Png)
$featBmp.Save($featDestJpg, [System.Drawing.Imaging.ImageFormat]::Jpeg)
Write-Output "Saved 1024x500 feature graphic to $featDestPng and $featDestJpg"

# Cleanup
$g2.Dispose()
$featBmp.Dispose()
$logo.Dispose()
