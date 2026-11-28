const L=require('./lib.js'),G=L.engine();
for(const n of process.argv.slice(2)){const c=L.db().byName.get(n);const a=G.analyze(Object.assign({qty:1},c),['W','U','B','R','G']);const cov=(a.a||a).coverage||[];console.log('##',n);cov.forEach(r=>{if(r.status!=='ok')console.log('  ',r.status,r.tag||'','|',(r.text||'').slice(0,230))})}
