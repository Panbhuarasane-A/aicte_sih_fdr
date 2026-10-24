/* Data remains empty until connected to authorized AICTE services. */
const D=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const ROLES={head:'Regulation Bureau Head (all regions)',south:'Scrutiny Officer, South region',ne:'Scrutiny Officer, North East region'};
const ROLEREG={south:'South',ne:'NE'};
const REGIONS=['North','South','East','West','NE','Central'];
const RULES={base:null,concession:null,lease:null,graceDays:null,tiers:[],reminders:[],windowDays:null};
const INST=[];
const FDRS=[];
const STMT=[];
const CLAIMS=[];
const DOCS=[];
export {D,ROLES,ROLEREG,RULES,INST,FDRS,STMT,CLAIMS,DOCS,REGIONS};