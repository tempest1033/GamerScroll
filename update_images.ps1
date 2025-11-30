$ErrorActionPreference = "Stop"
try {
    $content = Get-Content -Path "index.html" -Raw -Encoding UTF8
    
    # Replace Logo
    $logoPattern = '<svg[^>]*class="logo-svg"[^>]*>.*?</svg>'
    $logoReplacement = '<img src="logo.png" class="logo-img" alt="GamersCrawl Logo" style="height: 80px; width: auto;">'
    $newContent = [regex]::Replace($content, $logoPattern, $logoReplacement, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    if ($newContent -eq $content) { Write-Host "Warning: Logo not replaced" } else { Write-Host "Logo replaced" }

    # Replace Banner
    $bannerStart = '<div class="top-banner">'
    $idx = $newContent.IndexOf($bannerStart)
    if ($idx -ge 0) {
        $startContent = $idx + $bannerStart.Length
        # Find closing div
        $depth = 1
        $i = $startContent
        while ($depth -gt 0 -and $i -lt $newContent.Length) {
            $nextOpen = $newContent.IndexOf("<div", $i)
            $nextClose = $newContent.IndexOf("</div>", $i)
            
            if ($nextClose -eq -1) { break }
            
            if ($nextOpen -ne -1 -and $nextOpen -lt $nextClose) {
                $depth++
                $i = $nextOpen + 1
            } else {
                $depth--
                $i = $nextClose + 1
                $closeIdx = $nextClose
            }
        }
        
        if ($depth -eq 0) {
            $newBannerContent = '<img src="banner.png" class="banner-img" alt="GamersCrawl Banner" style="width: 100%; height: auto; display: block;">'
            $newContent = $newContent.Substring(0, $startContent) + $newBannerContent + $newContent.Substring($closeIdx)
            Write-Host "Banner replaced"
        } else {
            Write-Host "Error: Could not find closing div for banner"
        }
    } else {
        Write-Host "Error: Banner start not found"
    }

    Set-Content -Path "index.html" -Value $newContent -Encoding UTF8
    Write-Host "File saved successfully"
} catch {
    Write-Host "Error: $_"
    exit 1
}
