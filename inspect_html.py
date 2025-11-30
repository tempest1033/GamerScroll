import re

try:
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    start = content.find('<div class="top-banner">')
    if start != -1:
        # Print next 1000 chars to see structure
        print(content[start:start+1000])
    else:
        print("Top banner not found")

    logo_start = content.find('<svg class="logo-svg"')
    if logo_start != -1:
        print("\nLogo found")
    else:
        print("\nLogo not found")

except Exception as e:
    print(f"Error: {e}")
