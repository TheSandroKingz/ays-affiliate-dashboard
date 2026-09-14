import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('/Users/Sandro/ays-affiliate-dashboard/.env.local','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i), l.slice(i+1)];}));
export const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
export async function all(t, sel, mod=q=>q) {
  const out=[];
  for(let d=0;;d+=1000){
    const {data,error}=await mod(sb.from(t).select(sel)).range(d,d+999);
    if(error) throw new Error(t+': '+error.message);
    out.push(...data); if(data.length<1000) break;
  }
  return out;
}
export const madrid = (iso, len=10) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso)).slice(0,len);
