import { sb, all } from './lib.mjs';
const mad=(iso)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit'}).format(new Date(iso)).slice(0,7);
// ---- 1) replicar EXACTO el bucle de memoria (paginado por created_at, sin desempate)
const evsCode=[];
for(let d=0;;d+=1000){
  const {data,error}=await sb.from('postback_events').select('id, amount, player_id, created_at, event_type')
    .in('event_type',['ftd','redeposit']).not('amount','is',null)
    .order('created_at',{ascending:true}).range(d,d+999);
  if(error) throw error;
  if(!data||!data.length) break;
  evsCode.push(...data);
  if(data.length<1000) break;
}
// ---- 2) version correcta: orden estable created_at + id
const evsOk = await all('postback_events','id, amount, player_id, created_at, event_type',
  q=>q.in('event_type',['ftd','redeposit']).not('amount','is',null).order('created_at',{ascending:true}).order('id',{ascending:true}));

console.log('filas que ve el codigo:', evsCode.length, ' ids unicos:', new Set(evsCode.map(e=>e.id)).size);
console.log('filas correctas      :', evsOk.length,   ' ids unicos:', new Set(evsOk.map(e=>e.id)).size);
const setCode=new Set(evsCode.map(e=>e.id)), setOk=new Set(evsOk.map(e=>e.id));
const faltan=[...setOk].filter(i=>!setCode.has(i));
console.log('ids que el codigo PIERDE:', faltan.length, faltan.slice(0,10));
console.log('duplicados que el codigo ve:', evsCode.length - setCode.size);

function calc(evs){
  const dep=new Map(); const acum=new Map(); const vistos=new Set();
  const g=m=>{const a=dep.get(m)||{suma:0,n:0,total:0}; dep.set(m,a); return a;};
  for(const e of evs){
    const pid=e.player_id, imp=Number(e.amount||0), m=mad(e.created_at);
    if(pid&&imp>0){ const antes=acum.get(pid)??0; if(imp>antes){ g(m).total+=imp-antes; acum.set(pid,imp);} }
    if(e.event_type!=='ftd'||imp<=0) continue;
    if(pid){ if(vistos.has(pid)) continue; vistos.add(pid); }
    const a=g(m); a.suma+=imp; a.n+=1;
  }
  return dep;
}
const A=calc(evsCode), B=calc(evsOk);
console.log('\nmes    | CODIGO total   media  n   | CORRECTO total   media  n   | dif €');
for(const m of [...new Set([...A.keys(),...B.keys()])].sort()){
  const a=A.get(m)||{suma:0,n:0,total:0}, b=B.get(m)||{suma:0,n:0,total:0};
  console.log(m, '|', a.total.toFixed(2).padStart(10), (a.n?a.suma/a.n:0).toFixed(2).padStart(7), String(a.n).padStart(4),
    '|', b.total.toFixed(2).padStart(10), (b.n?b.suma/b.n:0).toFixed(2).padStart(7), String(b.n).padStart(4),
    '| dif total', (a.total-b.total).toFixed(2));
}
