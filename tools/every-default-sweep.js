#!/usr/bin/env node
// Every-default sweep: a seated person who answers every question with the autopilot's pick must play the autopilot's game exactly.
// Every ordered pair of the fixture decks, seeds 11 and 12 (--seeds 23,24), the person in seat 0 or 1 by seed parity, up to 14 rounds;
// each turn is played with D.resolveSync(D.playPlan) beside a copy nobody plays, and D.dump is compared after every turn.
//   node tools/every-default-sweep.js            all pairs (about 2 minutes)
//   PRIORITY=1 node tools/every-default-sweep.js   the same with opts.priority on and a question at every step (T-127)
//   FUZZY=1 node tools/every-default-sweep.js     the same with "Guess unknown rules" on (T-131: guessed lines play like their template; the person must still play the autopilot's game)
//   node tools/every-default-sweep.js 0 4        part 0 of 4 (run the four parts side by side)
// Prints 'bad 0' when nothing differs; a DIVERGE line names the pair, seed, seat and round. Exit code 1 on any difference.
const fs=require('fs'),R=require('path').join(__dirname,'..'),G=require(R+'/goldfish/static/sim.js'),D=require(R+'/goldfish/static/decide.js');
if(process.env.FUZZY)G.setFuzzy(JSON.parse(fs.readFileSync(R+'/goldfish/static/data/fuzzy-index.json','utf8')));          // T-131: off unless asked for; the default sweep, the fingerprint and the bench never guess
const names=fs.readdirSync(R+'/tests/fixtures').filter(f=>f.endsWith('-loaded.json')).map(f=>f.replace('-loaded.json','')).filter(n=>!/combo-pieces|punishers|locks|chosen/.test(n));
const L={};names.forEach(n=>{const r=JSON.parse(fs.readFileSync(R+'/tests/fixtures/'+n+'-loaded.json','utf8'));L[n]=r;});
const O={turns:25,onPlay:false,minLands:2,maxLands:5,freeMulligan:true,minHandSize:5,oppLife:40,prioritizeCommander:true};
if(process.env.PRIORITY){O.priority=true;O.autoPass='never';}          // T-127: the priority round on, asking at every step: taking every default (Pass) must still be the autopilot's game
const SEEDS=(process.argv.includes('--seeds')?process.argv[process.argv.indexOf('--seeds')+1]:'11,12').split(',').map(Number);
const part=+(process.argv[2]||0),parts=+(process.argv[3]||1);let bad=0,n=0,qs=0;const kinds={};
let idx=0;
for(let i=0;i<names.length;i++)for(let j=0;j<names.length;j++){if(i===j)continue;if((idx++)%parts!==part)continue;
 for(const seed of SEEDS){const seat=seed%2;
  const mk=()=>G.newPod([names[i],names[j]].map(n=>G.buildDeck(L[n].cards,L[n].tokens)),[O,O],seed,[names[i],names[j]],0);
  const H=mk(),P=mk();D.seat(H.games[seat]);let ok=true;
  for(let r=0;r<14&&H.match.winner==null&&ok;r++)for(let k=0;k<2;k++){if(H.match.winner!=null)break;const pid=H.match.order[k].pid;
   try{D.resolveSync(H.games,seat,gs=>D.playPlan(gs,pid),q=>{qs++;kinds[q.kind]=(kinds[q.kind]||0)+1;return 'auto';});}catch(e){console.log('ERR',names[i],names[j],seed,e.message);ok=false;bad++;break;}
   const ep=D.playPlan(P.games,pid);n++;
   if(D.dump(H.games)!==D.dump(P.games)){ok=false;bad++;console.log('DIVERGE',names[i],'v',names[j],'seed',seed,'seat',seat,'round',r,'pid',pid,'notes P:',ep.filter(e=>e.type==='note').map(e=>e.text).join(' | ').slice(0,300));break;}}
 }}
console.log('part',part,'turns',n,'questions',qs,JSON.stringify(kinds),'bad',bad);
if (bad) process.exit(1);
