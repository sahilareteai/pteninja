Add-Type -AssemblyName System.Drawing

function Resize-ImageFile {
    param(
        [string]$sourcePath,
        [string]$destPath,
        [int]$width,
        [int]$height,
        [string]$format = "Png"
    )
    $src = [System.Drawing.Image]::FromFile($sourcePath)
    $dest = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($dest)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, $width, $height)
    
    if ($format -eq "Png") {
        $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } else {
        $dest.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    }
    
    $g.Dispose()
    $dest.Dispose()
    $src.Dispose()
    Write-Output "Created: $destPath ($width x $height)"
}

$outputDir = "play_store_assets"
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$iconSrc = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\pte_app_icon_1792840196335.jpg"
Resize-ImageFile -sourcePath $iconSrc -destPath "$outputDir\app_icon_512x512.png" -width 512 -height 512 -format "Png"

$featureSrc = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\feature_graphic_1792840260862.jpg"
Resize-ImageFile -sourcePath $featureSrc -destPath "$outputDir\feature_graphic_1024x500.png" -width 1024 -height 500 -format "Png"
Resize-ImageFile -sourcePath $featureSrc -destPath "$outputDir\feature_graphic_1024x500.jpg" -width 1024 -height 500 -format "Jpeg"

$s1 = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\screen1_speaking_1792840304054.jpg"
Resize-ImageFile -sourcePath $s1 -destPath "$outputDir\screenshot_1_speaking_1080x1920.png" -width 1080 -height 1920 -format "Png"
Resize-ImageFile -sourcePath $s1 -destPath "$outputDir\screenshot_1_speaking_1080x1920.jpg" -width 1080 -height 1920 -format "Jpeg"

$s2 = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\screen2_dashboard_1792840327038.jpg"
Resize-ImageFile -sourcePath $s2 -destPath "$outputDir\screenshot_2_dashboard_1080x1920.png" -width 1080 -height 1920 -format "Png"
Resize-ImageFile -sourcePath $s2 -destPath "$outputDir\screenshot_2_dashboard_1080x1920.jpg" -width 1080 -height 1920 -format "Jpeg"

$s3 = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\screen3_writing_1792840347574.jpg"
Resize-ImageFile -sourcePath $s3 -destPath "$outputDir\screenshot_3_writing_1080x1920.png" -width 1080 -height 1920 -format "Png"
Resize-ImageFile -sourcePath $s3 -destPath "$outputDir\screenshot_3_writing_1080x1920.jpg" -width 1080 -height 1920 -format "Jpeg"

$s4 = "C:\Users\sahil\.gemini\antigravity-ide\brain\cc068dab-0454-4548-9f62-6594d5a72dc3\screen4_mocktest_1792840370845.jpg"
Resize-ImageFile -sourcePath $s4 -destPath "$outputDir\screenshot_4_mocktest_1080x1920.png" -width 1080 -height 1920 -format "Png"
Resize-ImageFile -sourcePath $s4 -destPath "$outputDir\screenshot_4_mocktest_1080x1920.jpg" -width 1080 -height 1920 -format "Jpeg"


