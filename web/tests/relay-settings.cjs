// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
(async()=>{
 const {CELIO_RELAY,CELIO_RELAY_ORIGIN,CELIO_SOCKET_PATH,relayPreferenceKey,relayOrigin,relayURL,readRelayOrigin,saveRelayOrigin,validateRelayURL}=await import('../src/link/relay-settings.js');
 assert.equal(relayURL(CELIO_RELAY_ORIGIN),CELIO_RELAY);assert.equal(relayOrigin('wss://RELAY.example:443/'),'wss://relay.example');
 assert.equal(relayURL('wss://relay.example:8443'),'wss://relay.example:8443'+CELIO_SOCKET_PATH);
 for(const bad of ['',null,{},'https://relay.example','ws://relay.example','wss://user:pass@relay.example','wss://relay.example/#fragment','wss://relay.example/?secret=x','wss://relay.example/other','wss://relay.example/a/..','wss://relay.example/%2e%2e','wss://relay.example\\other',' wss://relay.example','wss://relay.example\n','wss://localhost','wss://sub.localhost','wss://host.local','wss://127.0.0.1','wss://0x7f000001','wss://[::1]','wss://relay.example:99999','wss://-relay.example','wss://relay.example.'])assert.throws(()=>relayOrigin(bad),String(bad));
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 assert.equal(readRelayOrigin(storage),CELIO_RELAY_ORIGIN);assert.equal(saveRelayOrigin('wss://custom.example',storage),'wss://custom.example');
 assert.equal(readRelayOrigin(storage),'wss://custom.example');assert.throws(()=>saveRelayOrigin('ws://custom.example',storage));assert.equal(readRelayOrigin(storage),'wss://custom.example');
 values.set(relayPreferenceKey,'javascript:bad');assert.equal(readRelayOrigin(storage),CELIO_RELAY_ORIGIN);
 saveRelayOrigin(CELIO_RELAY_ORIGIN,storage);assert.equal(values.size,0);
 const inaccessible={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
 assert.equal(readRelayOrigin(inaccessible),CELIO_RELAY_ORIGIN);assert.throws(()=>saveRelayOrigin('wss://custom.example',inaccessible));
 assert.equal(validateRelayURL(relayURL('wss://custom.example')),relayURL('wss://custom.example'));
 for(const bad of ['wss://relay.example/other',CELIO_RELAY+'&token=123','ws://127.0.0.1:1234'+CELIO_SOCKET_PATH])assert.throws(()=>validateRelayURL(bad));
 const local='ws://127.0.0.1:1234'+CELIO_SOCKET_PATH;assert.equal(validateRelayURL(local,{loopback:true}),local);
 assert.throws(()=>validateRelayURL('ws://127.0.0.1:99999'+CELIO_SOCKET_PATH,{loopback:true}));
 assert.throws(()=>validateRelayURL('ws://remote.example:1234'+CELIO_SOCKET_PATH,{loopback:true}));
 console.log('PASS relay settings: secure fixed endpoint, URL ambiguity rejection, persistence/fallback and isolated loopback fixture.');
})().catch(error=>{console.error(error);process.exitCode=1;});
