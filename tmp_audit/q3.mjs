import { sb, all } from './lib.mjs';
const af = await all('affiliates','id,user_id,display_name');
const name = Object.fromEntries(af.map(a=>[a.user_id,a.display_name]));
const ev = await all('postback_events','id,event_type,status,counted,commission,amount,player_id,matched_user_id,created_at,counted_date,isocountry',q=>q.order('id'));
console.log('eventos:',ev.length);
const byTS = {};
for(const e of ev){ const k=e.event_type+'/'+e.status+'/'+e.counted; byTS[k]=(byTS[k]||0)+1; }
console.log(JSON.stringify(byTS,null,1));
// counted events per month per user
const mad=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid'}).format(new Date(iso));
const m=new Map();
for(const e of ev){
  if(!e.counted) continue;
  const d = e.counted_date? String(e.counted_date).slice(0,10) : mad(e.created_at);
  const k=d.slice(0,7)+'|'+(name[e.matched_user_id]||e.matched_user_id);
  const a=m.get(k)||{n:0,com:0,tipos:{}}; a.n++; a.com+=Number(e.commission||0); a.tipos[e.event_type]=(a.tipos[e.event_type]||0)+1; m.set(k,a);
}
console.log('--- eventos counted=true por mes/usuario (n, suma commission)');
for(const [k,v] of [...m.entries()].sort()) console.log(k.padEnd(28),'n='+String(v.n).padStart(4),'com='+v.com.toFixed(2).padStart(10), JSON.stringify(v.tipos));
