import { sb, all } from './lib.mjs';
const af = await all('affiliates','id,user_id,display_name,cpa_spain');
const name = Object.fromEntries(af.map(a=>[a.user_id,a.display_name]));
const daily = await all('affiliate_daily_stats','*',q=>q.order('date').order('user_id'));
console.log('filas daily:', daily.length, 'usuarios distintos:', new Set(daily.map(d=>d.user_id)).size);
console.log('cols:', Object.keys(daily[0]).join(','));
// por mes y usuario
const m = new Map();
for(const d of daily){
  const k = String(d.date).slice(0,7)+'|'+(name[d.user_id]||d.user_id);
  const a = m.get(k)||{com:0,ftd:0,clicks:0,reg:0,dias:0};
  a.com+=Number(d.commission||0); a.ftd+=Number(d.ftd||0); a.clicks+=Number(d.clicks||0); a.reg+=Number(d.registrations||0); a.dias++;
  m.set(k,a);
}
for(const [k,v] of [...m.entries()].sort()) console.log(k.padEnd(28), 'com='+v.com.toFixed(2).padStart(10), 'ftd='+String(v.ftd).padStart(4), 'clk='+String(v.clicks).padStart(6), 'reg='+String(v.reg).padStart(5));
// usuarios en daily que NO estan en affiliates
const known=new Set(af.map(a=>a.user_id));
console.log('huerfanos:', [...new Set(daily.filter(d=>!known.has(d.user_id)).map(d=>d.user_id))]);
