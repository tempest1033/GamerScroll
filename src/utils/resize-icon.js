// 앱 아이콘 URL을 지정 크기로 리사이즈
// iOS 512x512 → 100x100, Android 원본 → =s100 (Retina 2x 대응)
function resizeIcon(url, size) {
  if (!url) return '';
  size = size || 100;
  // iOS (mzstatic.com): /512x512bb.jpg → /100x100bb.jpg
  if (url.includes('mzstatic.com/')) {
    return url.replace(/\/\d+x\d+bb\./, '/' + size + 'x' + size + 'bb.');
  }
  // Android (googleusercontent.com): append =s100
  if (url.includes('googleusercontent.com/')) {
    return url.split('=')[0] + '=s' + size;
  }
  return url;
}

module.exports = { resizeIcon };
