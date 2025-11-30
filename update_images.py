import re

file_path = 'index.html'
try:
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace Logo
    logo_pattern = r'<svg[^>]*class="logo-svg"[^>]*>.*?</svg>'
    logo_replacement = '<img src="logo.png" class="logo-img" alt="GamersCrawl Logo" style="height: 80px; width: auto;">'

    new_content = re.sub(logo_pattern, logo_replacement, content, flags=re.DOTALL)

    if new_content == content:
        print("Warning: Logo not found or not replaced.")
    else:
        print("Logo replaced.")

    content = new_content

    # Replace Banner
    def find_closing_tag(html, start_index, tag='div'):
        count = 1
        i = start_index
        while count > 0 and i < len(html):
            next_open = html.find(f'<{tag}', i)
            next_close = html.find(f'</{tag}>', i)
            
            if next_close == -1:
                return -1 # Not found
            
            if next_open != -1 and next_open < next_close:
                count += 1
                i = next_open + 1
            else:
                count -= 1
                i = next_close + 1
                close_index = next_close
                
        return close_index

    banner_start_str = '<div class="top-banner">'
    start_idx = content.find(banner_start_str)
    if start_idx != -1:
        content_start = start_idx + len(banner_start_str)
        end_idx = find_closing_tag(content, content_start, 'div')
        if end_idx != -1:
            # Replace content between content_start and end_idx
            new_banner_content = '<img src="banner.png" class="banner-img" alt="GamersCrawl Banner" style="width: 100%; height: auto; display: block;">'
            content = content[:content_start] + new_banner_content + content[end_idx:]
            print("Banner content replaced.")
        else:
            print("Error: Could not find closing div for banner.")
    else:
        print("Error: Top banner div not found.")

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
except Exception as e:
    print(f"An error occurred: {e}")
