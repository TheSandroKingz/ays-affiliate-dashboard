import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(fs.readFileSync("/Users/Sandro/ays-affiliate-dashboard/.env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});

async function pageAll(table, sel, apply) {
  let out=[], from=0;
  for(;;){
    let q = sb.from(table).select(sel).range(from, from+999);
    if (apply) q = apply(q);
    const {data,error} = await q;
    if(error){console.log("ERR",table,error.message);break;}
    out=out.concat(data||[]);
    if(!data||data.length<1000)break;
    from+=1000;
  }
  return out;
}

// 1) daily stats agosto
const ds = await pageAll("affiliate_daily_stats","user_id,date,clicks,registrations,ftd,commission", q=>q.gte("date","2025-08-01").lte("date","2025-08-31"));
const tot = ds.reduce((a,r)=>({c:a.c+r.clicks,r:a.r+r.registrations,f:a.f+r.ftd,m:a.m+Number(r.commission)}),{c:0,r:0,f:0,m:0});
console.log("AGOSTO 2025 daily_stats totales:", tot, "filas:", ds.length);
const ds26 = await pageAll("affiliate_daily_stats","user_id,date,clicks,registrations,ftd,commission", q=>q.gte("date","2026-08-01").lte("date","2026-08-31"));
const tot26 = ds26.reduce((a,r)=>({c:a.c+r.clicks,r:a.r+r.registrations,f:a.f+r.ftd,m:a.m+Number(r.commission)}),{c:0,r:0,f:0,m:0});
console.log("AGOSTO 2026 daily_stats totales:", tot26, "filas:", ds26.length);

// 2) afiliados
const affs = await pageAll("affiliates","user_id,display_name,freshaffs_tracking_code,freshaffs_affiliate_id,promo_link,approved,cpa_spain,cpa_other");
console.log("\nAFILIADOS:", affs.length);
for(const a of affs) console.log(` tc=${JSON.stringify(a.freshaffs_tracking_code)} affid=${JSON.stringify(a.freshaffs_affiliate_id)} name=${a.display_name} promo=${a.promo_link?a.promo_link.slice(0,60):"NULL"} appr=${a.approved} cpa=${a.cpa_spain}/${a.cpa_other} uid=${a.user_id}`);
// colisiones case-insensitive
const m=new Map();
for(const a of affs){const k=(a.freshaffs_tracking_code||"").toLowerCase(); if(!m.has(k))m.set(k,[]); m.get(k).push(a.display_name);}
for(const [k,v] of m) if(v.length>1) console.log("COLISION tracking:",k,v);
