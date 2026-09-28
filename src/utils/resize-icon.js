// 앱 아이콘 URL을 지정 크기의 WebP로 리사이즈 (원본 PNG/JPG보다 약 30% 작음)
// iOS 512x512 → 100x100 WebP, Android 원본 → =s100-rw (Retina 2x 대응)
function resizeIcon(url, size) {
  if (!url) return '';
  size = size || 100;
  // iOS (mzstatic.com): /512x512bb.jpg → /100x100bb.webp
  if (url.includes('mzstatic.com/')) {
    return url.replace(/\/\d+x\d+bb\.[a-z]+/, '/' + size + 'x' + size + 'bb.webp');
  }
  // Android (googleusercontent.com): =s100-rw (-rw = WebP 출력)
  if (url.includes('googleusercontent.com/')) {
    return url.split('=')[0] + '=s' + size + '-rw';
  }
  return url;
}

module.exports = { resizeIcon };
