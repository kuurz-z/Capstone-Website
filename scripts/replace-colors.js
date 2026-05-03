const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '..', 'web', 'src', 'features', 'admin'),
  path.join(__dirname, '..', 'web', 'src', 'features', 'tenant'),
  path.join(__dirname, '..', 'web', 'src', 'features', 'super-admin'),
  path.join(__dirname, '..', 'web', 'src', 'shared', 'components')
];

const excludeDirs = [
  path.join(__dirname, '..', 'web', 'src', 'features', 'public')
];

const replaceMap = {
  // Backgrounds
  'bg-white': 'bg-card',
  'bg-slate-50': 'bg-muted',
  'bg-slate-100': 'bg-muted',
  'bg-slate-200': 'bg-border',
  'bg-slate-800': 'bg-card',
  'bg-slate-900': 'bg-background',
  'bg-gray-50': 'bg-muted',
  'bg-gray-100': 'bg-muted',
  'bg-gray-200': 'bg-border',
  // Text
  'text-black': 'text-foreground',
  'text-slate-900': 'text-foreground',
  'text-slate-800': 'text-foreground',
  'text-slate-700': 'text-card-foreground',
  'text-slate-600': 'text-muted-foreground',
  'text-slate-500': 'text-muted-foreground',
  'text-slate-400': 'text-muted-foreground',
  'text-gray-900': 'text-foreground',
  'text-gray-800': 'text-foreground',
  'text-gray-700': 'text-card-foreground',
  'text-gray-600': 'text-muted-foreground',
  'text-gray-500': 'text-muted-foreground',
  'text-gray-400': 'text-muted-foreground',
  'text-white': 'text-primary-foreground',
  // Borders
  'border-slate-100': 'border-border',
  'border-slate-200': 'border-border',
  'border-slate-300': 'border-border',
  'border-slate-800': 'border-border',
  'border-gray-100': 'border-border',
  'border-gray-200': 'border-border',
  'border-gray-300': 'border-border',
  'border-gray-800': 'border-border',
  // Rings
  'focus:ring-blue-500': 'focus:ring-ring',
  'focus:ring-primary': 'focus:ring-ring',
  'ring-slate-200': 'ring-border',
  // Hovers
  'hover:bg-slate-50': 'hover:bg-muted',
  'hover:bg-slate-100': 'hover:bg-muted',
  'hover:border-slate-200': 'hover:border-border',
  'hover:border-slate-300': 'hover:border-border',
  // Status colors
  'bg-amber-100': 'bg-warning-light',
  'text-amber-600': 'text-warning-dark',
  'text-amber-700': 'text-warning-dark',
  'bg-blue-100': 'bg-info-light',
  'text-blue-700': 'text-info-dark',
  'bg-emerald-100': 'bg-success-light',
  'text-emerald-700': 'text-success-dark',
  'bg-rose-50': 'bg-error-light',
  'border-rose-100': 'border-error',
  'text-rose-600': 'text-error-dark'
};

const darkRegex = /dark:(bg|text|border|ring|hover:bg|hover:text|hover:border|focus:ring)-(slate|gray|white|black|transparent)(-\d+)?/g;

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Remove dark mode specific legacy tailwind classes
  content = content.replace(darkRegex, '');

  // 2. Consolidate redundant text colors
  content = content.replace(/text-muted-foreground text-(slate|gray)-\d00/g, 'text-muted-foreground');
  content = content.replace(/text-card-foreground text-(slate|gray)-\d00/g, 'text-card-foreground');
  content = content.replace(/text-foreground text-(slate|gray)-\d00/g, 'text-foreground');
  
  // Replace arbitrary hex values
  content = content.replace(/bg-\[#ffffff\]/g, 'bg-card');
  content = content.replace(/text-\[#1e293b\]/g, 'text-foreground');
  content = content.replace(/border-\[#e2e8f0\]/g, 'border-border');

  // 3. Replace all mapped classes
  for (const [oldClass, newClass] of Object.entries(replaceMap)) {
    // We use a regex that matches `oldClass` only if it's surrounded by non-word chars (like quotes or spaces)
    // Tailwind classes might have dashes, so \b works well for boundary
    const regex = new RegExp('\\b' + escapeRegExp(oldClass) + '\\b', 'g');
    content = content.replace(regex, newClass);
  }

  // Cleanup multiple spaces inside class names caused by removals
  content = content.replace(/ className=" +/g, ' className="');
  content = content.replace(/ +" /g, '" ');
  content = content.replace(/ +/g, ' ');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    
    // Skip excluded directories
    if (excludeDirs.some(exclude => fullPath.startsWith(exclude))) {
      continue;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      processFile(fullPath);
    }
  }
}

for (const dir of targetDirs) {
  walk(dir);
}
console.log('Done.');
