import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }});
const spec = await res.json();
const out = {};
for (const [name, def] of Object.entries(spec.definitions || {})) {
  out[name] = Object.entries(def.properties||{}).map(([c,p])=>`${c}:${(p.format||p.type||'?')}`);
}
fs.writeFileSync('/private/tmp/claude-502/-Users-Sandro-ays-affiliate-dashboard/645dcfbf-aebc-420f-bdf2-d8e5a99a2691/scratchpad/live_schema.json', JSON.stringify(out,null,1));
console.log('tables:', Object.keys(out).length);
// RPCs
const paths = Object.keys(spec.paths||{}).filter(p=>p.startsWith('/rpc/'));
console.log('RPCS:', paths.join(', '));
