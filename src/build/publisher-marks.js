const fs = require('fs');
const path = require('path');

function copyPublisherMarks(root, docsDir) {
  const marks = JSON.parse(fs.readFileSync(path.join(root, 'data/publisher-marks.json'), 'utf8'));
  const destination = path.join(docsDir, 'assets/publisher-logos');
  fs.mkdirSync(destination, { recursive: true });
  for (const file of new Set(Object.values(marks).map(mark => mark.file))) {
    if (path.basename(file) !== file) throw new Error(`Invalid publisher mark filename: ${file}`);
    fs.copyFileSync(path.join(root, 'assets/publisher-logos', file), path.join(destination, file));
  }
}

module.exports = { copyPublisherMarks };
