const D=process.argv[2]; const a=require(D+'/base.json'), b=require(D+'/new.json'); const L=require('./lib.js');
const cards=new Map(L.db().all.map(c=>[c.name,c])); const by={}; let lines=0, cs=new Set(), list=[];
for(const n in b){ if(!a[n]||typeof b[n]=='string'||typeof a[n]=='string')continue; b[n].forEach((r,i)=>{const o=a[n][i]; if(o&&o[1]!==r[1]){lines++;cs.add(n);list.push([n,o[1],r[1],r[0].slice(0,110)]);}});}
const setOf=n=>(cards.get(n)||{}).set||'?';
list.forEach(l=>console.log(l.join(' | ')));
console.log('lines',lines,'cards',cs.size);
