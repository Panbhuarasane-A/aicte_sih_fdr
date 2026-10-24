import {D,INST,FDRS,STMT,CLAIMS,DOCS,RULES,ROLEREG} from '../data/seed.js';
/* Deterministic rules engine. Flags and routes; it never approves or releases. */
const E={
fmt:n=>'₹'+n.toLocaleString('en-IN'),
inst:id=>INST.find(i=>i.id===id),
dd:s=>Math.round((new Date(s)-new Date(D(0)))/864e5),
add:(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)},
vis:(i,r,institutionId)=>r==='institution'?i.id===institutionId:r==='head'||i.region===ROLEREG[r],
missing:f=>[['request','Request letter'],['aff6','Affidavit 6']].filter(n=>!f.rel.docs.includes(n[0])).map(n=>n[1]),
req(i){if(!Number.isFinite(RULES.base)||!Number.isFinite(RULES.concession)||!Number.isFinite(RULES.lease))throw new Error('Official deposit rules are not configured.');const a=[RULES.base,i.concession?RULES.concession:1,i.tenure==='leased'?RULES.lease:1],t=a[0]*a[1]*a[2];
 return{amt:t,txt:`${E.fmt(a[0])} × ${a[1]} (concession) × ${a[2]} (lease) = ${E.fmt(t)}`}},
pen(i,paid){if(!Number.isFinite(RULES.graceDays)||!RULES.tiers.length)throw new Error('Official penalty rules are not configured.');const dl=E.add(i.intim,RULES.graceDays),y=dl.slice(0,4);
 if(paid<=dl)return{dl,t:'Paid on time'};
 for(const t of RULES.tiers){const end=`${y}-${String(t.m).padStart(2,'0')}-${t.d}`;
  if(paid<=end)return{dl,t:`Late: ${t.pct}% penalty (window to ${end})`,pct:t.pct,amt:E.req(i).amt*t.pct/100}}
 return{dl,t:'Paid after 31 July: eligible for withdrawal of approval',pct:20,amt:E.req(i).amt*.2}},
verify(c){const x=CLAIMS.indexOf(c),dup=CLAIMS.slice(0,x).find(y=>y.utr===c.utr),s=STMT.find(l=>l.utr===c.utr),f=E.fmt;
 if(dup)return{st:'DUPLICATE_CLAIM',ev:[`UTR already claimed by ${E.inst(dup.inst).name}`],act:'Hold both claims and request clarification'};
 if(s)return s.amt!==c.amt
  ?{st:'AMOUNT_MISMATCH',ev:[`Claimed ${f(c.amt)} vs statement ${f(s.amt)} (difference ${f(c.amt-s.amt)})`,`Statement line: ${s.date} · ${s.narr}`],act:'Do not accept; request revised proof'}
  :{st:'EXACT_MATCH',ev:[`${s.utr} · ${f(s.amt)} · ${s.date} · ${s.narr}`],act:'Consistent with statement; forward for officer verification'};
 const p=STMT.filter(l=>l.amt===c.amt&&Math.abs(E.dd(l.date)-E.dd(c.date))<=RULES.windowDays);
 return p.length?{st:'POSSIBLE_MATCH',ev:p.map(l=>`Candidate ${l.utr} · ${f(l.amt)} · ${l.date} (UTR differs)`),act:'Officer to confirm the UTR with the bank'}
  :{st:'MISSING_TRANSACTION',ev:['No statement line for this UTR or for the amount and date window'],act:'Request fresh payment proof'}},
doc(d){const f=FDRS.find(x=>x.id===d.fdr),n=E.inst(f.inst).name,fl=[],m=k=>k==='Amount',
 c=(k,a,b)=>{if(a!==b)fl.push({k,a:m(k)?E.fmt(a):a,b:m(k)?E.fmt(b):b})};
 c('Holder',d.x.holder,n);c('Amount',d.x.amount,f.amount);c('Issue date',d.x.issue,f.issue);c('Maturity date',d.x.mat,f.mat);
 if(d.x.mat<=d.x.issue)fl.push({k:'Date logic',a:'Maturity '+d.x.mat,b:'Must be after issue '+d.x.issue});
 const o=DOCS.slice(0,DOCS.indexOf(d)).find(y=>y.hash===d.hash);
 if(o)fl.push({k:'Duplicate',a:'Same file fingerprint as '+o.name,b:'Each instrument has its own document'});
 return fl},
ask(q,role,institutionId){if(!INST.length||!FDRS.length)return{title:'Database unavailable',rows:['No institution or FDR records are connected. Connect the portal to an authorized AICTE data service before searching.']};const l=q.toLowerCase(),vis=i=>E.vis(i,role,institutionId),ok=f=>vis(E.inst(f.inst));let t,rows=[],src,denied;
 if(/matur/.test(l)){const n=+(l.match(/\d+/)||[30])[0];t=`FDRs maturing in the next ${n} days`;
  rows=FDRS.filter(f=>ok(f)&&E.dd(f.mat)>=0&&E.dd(f.mat)<=n).map(f=>`${f.no} · ${E.inst(f.inst).name} · ${E.fmt(f.amount)} · matures ${f.mat} (${E.dd(f.mat)} days)`);src='dash'}
 else if(/unmatched|not.*matched|haven.?t been matched/.test(l)){t='Claims not matched exactly to the statement';
  rows=CLAIMS.filter(c=>vis(E.inst(c.inst))&&E.verify(c).st!=='EXACT_MATCH').map(c=>`${E.inst(c.inst).name} · ${c.utr} · ${E.verify(c).st}`);src='ver'}
 else if(/release/.test(l)){t='Release requests with missing documents';
  rows=FDRS.filter(f=>ok(f)&&f.rel&&E.missing(f).length).map(f=>`${E.inst(f.inst).name} · ${f.no} · missing ${E.missing(f).join(', ')}`);src='dash'}
 else if(/why|flag/.test(l)){const hit=INST.find(i=>l.includes(i.name.split(' ')[0].toLowerCase()));
  if(hit&&!vis(hit)){t='Request refused';denied=1;rows=['This institution is outside your assigned region.']}
  else{t='Flags'+(hit?' for '+hit.name:' in your scope');
   (hit?[hit]:INST.filter(vis)).forEach(i=>{
    CLAIMS.filter(c=>c.inst===i.id).forEach(c=>{const r=E.verify(c);if(r.st!=='EXACT_MATCH')rows.push(`${i.name}: ${r.st}. ${r.ev[0]}`)});
    DOCS.filter(d=>FDRS.find(f=>f.id===d.fdr).inst===i.id).forEach(d=>E.doc(d).forEach(x=>rows.push(`${i.name}: ${d.name}, ${x.k} shows ${x.a}, expected ${x.b}`)));
    const p=E.pen(i,i.paid);if(p.pct)rows.push(`${i.name}: ${p.t}`);
    if(i.punitive)rows.push(`${i.name}: under punitive action, release blocked`)});src='ver'}}
 else{t='Ask about maturities, unmatched transactions, release requests or flags.';rows=['Try one of the sample questions.']}
 return{title:t,rows:rows.length?rows:['No matching records.'],src,denied}}
};
export default E;