const fs = require('fs')
const ids = new Set()
for (const f of ['assets/js/app.js', 'assets/js/ui.js', 'assets/js/api.js']) {
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\$\(\s*['"`]#([\w-]+)/g)) ids.add(m[1])
  for (const m of s.matchAll(/getElementById\(\s*['"`]([\w-]+)/g)) ids.add(m[1])
  for (const m of s.matchAll(/querySelector\(\s*['"`]#([\w-]+)/g)) ids.add(m[1])
}
const list = [...ids].sort()
console.log(list.length + ' ids referenced by JS:')
console.log(list.join(' '))
