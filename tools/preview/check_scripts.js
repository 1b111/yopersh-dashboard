// Syntax-checks every inline <script> block of a page.
//   node check_scripts.js <page.html>
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let m;
let n = 0;
let bad = 0;
while ((m = re.exec(html))) {
  if (/\ssrc\s*=/.test(m[1] || '')) continue;
  if (/type\s*=\s*["']?(application\/json|text\/template)/i.test(m[1] || '')) continue;
  n++;
  const line = html.slice(0, m.index).split('\n').length;
  try {
    new vm.Script(m[2], { filename: `inline script at line ${line}` });
  } catch (e) {
    bad++;
    console.log(`SYNTAX ERROR in the script starting at line ${line}: ${e.message}`);
    const at = /:(\d+)/.exec(String(e.stack).split('\n')[0] || '');
    if (at) console.log('  near page line', line + Number(at[1]) - 1);
  }
}
console.log(`${n} inline scripts checked, ${bad} with errors`);
process.exit(bad ? 1 : 0);
