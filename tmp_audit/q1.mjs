import { sb, all } from './lib.mjs';
const af = await all('affiliates','*', q=>q.order('id'));
for (const a of af) console.log(JSON.stringify({id:a.id,user_id:a.user_id,name:a.display_name,cpa_spain:a.cpa_spain,cpa_other:a.cpa_other,ref:a.referred_by,pct:a.subaffiliate_percent,approved:a.approved,active:a.active}));
console.log('--- payments');
console.log(JSON.stringify(await all('payments','*',q=>q.order('id')),null,1));
console.log('--- penalizaciones');
console.log(JSON.stringify(await all('penalizaciones','*'),null,1));
