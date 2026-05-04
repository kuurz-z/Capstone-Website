const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'web', 'src', 'features', 'admin', 'components', 'billing', 'ElectricityBillingTab.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find startEditBill and remove through to the Render comment
const startMarker = '  const startEditBill';
const endMarkerSrc = '  const openBatchCloseModal';

const startIdx = content.indexOf(startMarker);
// Go back to include the comment line before startEditBill
const commentStart = content.lastIndexOf('\n', startIdx - 1);
const actualStart = content.lastIndexOf('\n', commentStart - 1) + 1;

const endIdx = content.indexOf(endMarkerSrc);

if (startIdx === -1 || endIdx === -1) {
  console.log('Markers not found. startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

console.log('Found block. actualStart:', actualStart, 'endIdx:', endIdx);
console.log('Removing:', JSON.stringify(content.slice(actualStart, endIdx).slice(0, 100)));

const newContent = content.slice(0, actualStart) + '\n' + content.slice(endIdx);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done. Cleaned up stale draft bill handlers.');
