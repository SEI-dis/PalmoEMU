// SPDX-License-Identifier: AGPL-3.0-or-later
// Adversarial protocol checks run in each browser by room-link.cjs.
module.exports=async page=>{
 const result=await page.evaluate(async()=>{
  const {RoomLink}=await import('./src/link/room-link.js');
  const check=(value,message)=>{if(!value)throw Error(message);};
  const packet=(sequence,value=sequence)=>({sequence,data:Array(32).fill(value)});
  const create=()=>{
   const frames=[],words=[],commands=[],ended=[];
   const link=new RoomLink({enable(){},mask(){},write(){}},{onEnd:(reason,info)=>ended.push({reason,...info})});
   link.joined=true;link.connected=true;link.deviceStarted=true;link.socket={readyState:WebSocket.OPEN,bufferedAmount:0,send:text=>frames.push(text),close(){}};
   link.device.receive=data=>words.push(data[0]);link.device.command=value=>commands.push(value);
   return {link,frames,words,commands,ended};
  };
  const message=(link,id,event,value)=>link.message('42'+(id<0?'':id)+JSON.stringify([event,value]));
  const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
  // The old RxJS server receives exactly one argument, with no ACK callback.
  const old=create();message(old.link,-1,'deviceCommand',{uuid:'old-mode',command:0x10});old.link.sendData(packet(0).data);
  check(!old.link.batched&&old.frames[0].startsWith('42['),'Legacy single-packet output');old.link.close();
  const a=create();
  message(a.link,7,'deviceCommand',{uuid:'new-mode',command:0x10});
  message(a.link,8,'deviceCommand',{uuid:'new-mode',command:0x10});
  check(a.link.batched&&a.commands.length===1&&a.frames.includes('438[true]'),'Duplicate commands must be ACKed but not executed twice');
  // Retry payloads and ACKs can arrive out of order. Deliver each word only once.
  message(a.link,9,'deviceData',[packet(2),packet(1),packet(1),packet(0)]);
  message(a.link,10,'deviceData',[packet(0),packet(2)]);
  check(JSON.stringify(a.words)==='[0,1,2]'&&a.frames.includes('4310[true]'),'Reorder/deduplicate and ACK batches');
  const rejected=(payload,description)=>{let threw=false;try{message(a.link,11,'deviceData',payload);}catch{threw=true;}check(threw,description);};
  rejected([packet(3),{sequence:4,data:[0]}],'Invalid tail must reject whole batch');check(a.words.length===3,'No partial invalid batch delivered');
  rejected([],'Empty batch');rejected(Array.from({length:1025},()=>packet(3)),'Oversized batch');rejected([packet(1030)],'Sequence gap bound');
  rejected([{sequence:-1,data:Array(32).fill(0)}],'Negative sequence');rejected([{sequence:3,data:Array(32).fill(65536)}],'uint16 bound');
  let oversized=false;try{a.link.message(' '.repeat(262145));}catch{oversized=true;}check(oversized,'Frame byte bound');
  // Max protocol batch size can exceed the old 64KiB message limit.
  const large=create();message(large.link,1,'deviceData',Array.from({length:1024},(_,i)=>packet(i,65535)));
  check(large.words.length===1024&&large.link.received===65536,'Full upstream 1024-packet batch');large.link.close();
  for(let i=0;i<70;i++)a.link.sendData(packet(i).data);
  await tick();const batches=a.frames.filter(f=>/^42\d+\["deviceData"/.test(f));
  check(batches.length===3&&a.link.inFlight.size===3,'Batch without frame delay');
  for(const frame of batches){const id=Number(/^42(\d+)/.exec(frame)[1]);a.link.message('43'+id+'[true]');}
  check(a.link.inFlight.size===0&&a.link.outgoingCount===0,'ACK frees all queued words');
  // Retry the identical event, not a fresh status/sequence, after a lost ACK.
  a.link.status(0xFF03);await tick();const first=a.frames.at(-1);
  await new Promise(resolve=>setTimeout(resolve,1100));check(a.frames.at(-1)===first,'Retry identical payload/ID');
  const id=Number(/^42(\d+)/.exec(first)[1]);a.link.message('43'+id+'[true]');
  a.link.message('43'+id+'[true]');check(!a.link.inFlight.size,'Duplicate ACK harmless');
  // Negative ACK, queue/backpressure and timeout fail instead of losing data.
  a.link.sendData(packet(0).data);await tick();const lastId=a.link.nextAck-1;
  let nack=false;try{a.link.message('43'+lastId+'[false]');}catch{nack=true;}check(nack,'Rejected event fails');a.link.close();
  const bounded=create();bounded.link.batched=true;
  for(let i=0;i<1024;i++)bounded.link.sendData(packet(i).data);
  let full=false;try{bounded.link.sendData(packet(1024).data);}catch{full=true;}check(full,'Outgoing queue bounded');bounded.link.close();await tick();check(!bounded.frames.some(f=>f.includes('deviceData')),'No scheduled sends after close');
  const windowed=create();windowed.link.batched=true;for(let i=0;i<65;i++)windowed.link.status(0xFF03);await tick();
  check(windowed.link.inFlight.size===64&&windowed.link.outgoing.length===1,'In-flight window bounded');windowed.link.message('431[true]');await tick();check(windowed.link.outgoing.length===0&&windowed.link.inFlight.size===64,'ACK advances window');windowed.link.close();
  const timeout=create();timeout.link.batched=true;timeout.link.status(0xFF03);await tick();[...timeout.link.inFlight.values()][0].attempt=6;
  await new Promise(resolve=>setTimeout(resolve,1100));check(timeout.link.closed&&timeout.ended[0].keep===false&&!timeout.link.inFlight.size,'Retry exhaustion interrupts and clears timers');
  for(const [event,keep] of [['partnerLeft',false],['sessionClose',false],['sessionClose',true]]){
   const x=create();x.link.gameClosed=keep;message(x.link,17,event,{uuid:event});
   check(x.frames[0]==='4317[true]'&&x.ended[0].keep===keep,'ACK before close; commit only on normal game close');
  }
  const join=create();join.link.connected=false;join.link.deviceStarted=false;let resets=0;join.link.device.reset=()=>resets++;
  message(join.link,20,'partnerJoined',{uuid:'join'});message(join.link,21,'partnerJoined',{uuid:'join'});
  check(resets===1&&join.frames.includes('4321[true]'),'Retried join does not reset game');join.link.close();
  const lobby=create();lobby.link.connected=false;lobby.link.deviceStarted=false;lobby.link.setBackground(true);let starts=0;lobby.link.io.enable=value=>{if(value)starts++;};
  message(lobby.link,30,'partnerJoined',{uuid:'hidden-join'});message(lobby.link,31,'partnerJoined',{uuid:'hidden-join'});
  check(lobby.link.connected&&!lobby.link.closed&&!lobby.link.deviceStarted&&starts===0,'Hidden join retains room without starting the device');
  check(lobby.frames.includes('4331[true]'),'Hidden joins are acknowledged so server retries do not evict the room');
  message(lobby.link,34,'deviceCommand',{uuid:'early-connect',command:0x13});message(lobby.link,35,'deviceCommand',{uuid:'early-connect',command:0x13});
  message(lobby.link,36,'deviceData',[packet(1),packet(0)]);message(lobby.link,37,'deviceData',[packet(0)]);
  check(lobby.words.length===0&&lobby.commands.length===0&&lobby.link.lobbyData.length===2&&lobby.link.lobbyCommands.length===1,'Early data/commands held once, in order, without touching device');
  lobby.link.setBackground(false);lobby.link.setBackground(false);
  check(starts===1,'Return starts device exactly once');
  check(lobby.commands.filter(c=>c===0x13).length===1&&JSON.stringify(lobby.words)==='[0,1]','Return replays buffered input once in sequence');
  check(!lobby.link.canWait,'Replayed game-start messages end lobby waiting');
  lobby.link.setBackground(true);check(lobby.link.closed&&lobby.ended[0].keep===false,'Background during gameplay still rolls back');
  const mode=create();mode.link.connected=false;mode.link.deviceStarted=false;mode.link.startDevice();mode.link.setBackground(true);await new Promise(r=>setTimeout(r,550));
  check(!mode.commands.includes(0),'Background cancels pending mode request');mode.link.setBackground(false);await new Promise(r=>setTimeout(r,550));
  check(mode.commands.filter(c=>c===0).length===1,'Return sends mode once');mode.link.status(0xFF03);check(!mode.link.canWait,'Local handshake ends waiting');mode.link.close();
  const overflow=create();overflow.link.setBackground(true);message(overflow.link,40,'deviceData',Array.from({length:512},(_,i)=>packet(i)));
  let limited=false;try{message(overflow.link,41,'deviceData',[packet(512)]);}catch{limited=true;}check(limited&&overflow.link.lobbyData.length===512,'Background packet buffer is bounded');overflow.link.close();check(!overflow.link.lobbyData.length,'Close discards pending lobby packets');
  const cancelled=create();cancelled.link.connected=false;cancelled.link.deviceStarted=false;cancelled.link.setBackground(true);message(cancelled.link,32,'partnerJoined',{uuid:'cancel'});cancelled.link.close();cancelled.link.setBackground(false);check(!cancelled.link.deviceStarted,'Cancelled hidden lobby never restarts');
  const raced=create();raced.link.gameStarted=true;raced.link.backgrounded=true;message(raced.link,33,'deviceCommand',{uuid:'late-handshake',command:0x12});check(raced.link.closed&&!raced.commands.includes(0x12),'A late game-start command cannot run while backgrounded');
  return 'PASS: batched/legacy protocol, command and data deduplication, ACK retry, validation, memory limits and cleanup.';
 });console.log(result);
};
