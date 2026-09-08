import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync("/Users/Sandro/ays-affiliate-dashboard/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
async function pageAll(table, sel, apply){let out=[],from=0;for(;;){let q=sb.from(table).select(sel).range(from,from+999);if(apply)q=apply(q);const{data,error}=await q;if(error){console.log("ERR",error.message);break;}out=out.concat(data||[]);if(!data||data.length<1000)break;from+=1000;}return out;}

for(const tc of ["SAIqylWftX","patron","Fresh","Default"]){
  const {data} = await sb.from("postback_events").select("created_at,event_type,status,raw_query,afp,matched_user_id,commission").eq("tracking_code",tc).order("created_at",{ascending:false}).limit(2);
  const {data:d2} = await sb.from("postback_events").select("created_at").eq("tracking_code",tc).order("created_at",{ascending:true}).limit(1);
  console.log(`\n### ${tc}  primer=${d2?.[0]?.created_at} ultimo=${data?.[0]?.created_at}`);
  for(const r of (data||[])) console.log("   ", r.created_at, r.event_type, r.status, "afp="+r.afp, "€"+r.commission, "|", (r.raw_query||"").slice(0,300));
}
// distintos tracking_code globales
const all = await pageAll("postback_events","tracking_code,matched_user_id,status,event_type,commission,counted");
const g=new Map();
for(const e of all){const k=e.tracking_code; const o=g.get(k)||{n:0,cnt:0,eur:0,users:new Set()}; o.n++; if(e.status==="counted"&&e.event_type==="commission"){o.cnt++;o.eur+=Number(e.commission||0);} o.users.add(e.matched_user_id); g.set(k,o);}
console.log("\n=== TODOS los tracking_code (histórico):");
for(const [k,v] of [...g].sort((a,b)=>b[1].n-a[1].n)) console.log(`  ${k}: eventos=${v.n} qftd_counted=${v.cnt} €=${v.eur} users=${v.users.size}`);
