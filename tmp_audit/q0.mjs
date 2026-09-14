import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('/Users/Sandro/ays-affiliate-dashboard/.env.local','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i), l.slice(i+1)];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
for (const t of ['affiliate_daily_stats','gastos','postback_events','payments','affiliates','penalizaciones','telegram_contacts']) {
  const { count, error } = await sb.from(t).select('*', {count:'exact', head:true});
  console.log(t.padEnd(24), count ?? ('ERR '+error?.message));
}
// how many rows does .limit(100000) actually return
const { data } = await sb.from('affiliate_daily_stats').select('user_id').limit(100000);
console.log('limit(100000) devuelve:', data?.length);
