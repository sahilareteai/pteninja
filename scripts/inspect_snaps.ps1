Add-Type -AssemblyName System.Drawing

$files = Get-ChildItem -Path "C:\Users\sahil\Downloads\pteninjasnaps\*.jpg"
foreach ($f in $files) {
    $img = [System.Drawing.Image]::FromFile($f.FullName)
    $ratio = [math]::Round($img.Height / $img.Width, 3)
    Write-Output "$($f.Name) | Width: $($img.Width) | Height: $($img.Height) | Ratio: $ratio"
    $img.Dispose()
}
