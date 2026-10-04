const fs = require('fs');
const path = require('path');

const dir = './src';

function walk(dir, done) {
  let results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    let pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function(file) {
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
}

walk(dir, function(err, results) {
  if (err) throw err;
  results.filter(f => f.match(/\.(tsx|ts|css)$/)).forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    
    // Some text-white should become text-gray-900 (like headings)
    // Some hover:text-white should become text-gray-900
    content = content
      .replace(/text-white mb-4/g, 'text-gray-900 mb-4')
      .replace(/text-white flex items-center/g, 'text-gray-900 flex items-center')
      .replace(/hover:text-white/g, 'hover:text-gray-900')
      .replace(/text-white\">AutoCAD AI 助手/g, 'text-gray-900\">AutoCAD AI 助手');

    fs.writeFileSync(f, content);
  });
});
