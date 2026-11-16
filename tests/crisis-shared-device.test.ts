import { test } from 'node:test';
import assert from 'node:assert/strict';
import {hashGuardPin,verifyGuardPin,validateGuardSession,handoverSession,pinAttemptDecision,type GuardDeviceSession} from '../src/lib/patrol/shared-device';
import {createCheckpointQr,verifyCheckpointQr} from '../src/lib/patrol/checkpoint-qr';
import {classifyOfflineScan,generateOfflineAssignment} from '../src/lib/patrol/offline-plan';
const now=Date.UTC(2026,10,13,18);
const key='this-is-a-test-only-signing-key-at-least-32-chars';
const s:GuardDeviceSession={sessionId:'sA',deviceId:'company1',guardId:'guardA',siteId:'site1',shiftId:'shiftA',startedAtMs:now,expiresAtMs:now+3600000,endedAtMs:null,authMethod:'OFFLINE_PIN'};
test('guard PINs are salted, verified and reject bad input',async()=>{
 const a=await hashGuardPin('123456');const b=await hashGuardPin('123456');assert.notEqual(a,b);
 assert.equal(await verifyGuardPin('123456',a),true);assert.equal(await verifyGuardPin('123457',a),false);
 assert.equal(await verifyGuardPin('abc',a),false);await assert.rejects(hashGuardPin('123'),/PIN/);
 assert.equal(pinAttemptDecision(5,now,now+1000),'LOCKED'); assert.equal(pinAttemptDecision(5,now,now+900001),'ALLOW');
});
test('same phone changes guard identity on handover without changing historic event attribution',()=>{
 const next={...s,sessionId:'sB',guardId:'guardB',shiftId:'shiftB',startedAtMs:now+1800000,expiresAtMs:now+5400000};
 const h=handoverSession(s,next,now+1800000);
 assert.equal(validateGuardSession(h.outgoing,{deviceId:'company1',guardId:'guardA',shiftId:'shiftA',capturedAtMs:now+1200000}),'VALID');
 assert.equal(validateGuardSession(h.outgoing,{deviceId:'company1',guardId:'guardA',shiftId:'shiftA',capturedAtMs:now+1800001}),'ENDED');
 assert.equal(validateGuardSession(h.incoming,{deviceId:'company1',guardId:'guardB',shiftId:'shiftB',capturedAtMs:now+1800001}),'VALID');
 assert.equal(validateGuardSession(h.incoming,{deviceId:'company1',guardId:'guardA',shiftId:'shiftB',capturedAtMs:now+1800001}),'WRONG_GUARD');
});
test('signed QR maps to exact site and checkpoint, revoked credentials fail',()=>{
 const claims={version:1 as const,siteId:'site1',checkpointId:'gate',credentialId:'qr123',issuedAt:now};
 const qr=createCheckpointQr(claims,key);
 const opts={signingKey:key,siteId:'site1',validCredentialIds:new Set(['qr123']),checkpoints:new Set(['gate'])};
 assert.deepEqual(verifyCheckpointQr(qr,opts),{ok:true,claims});
 assert.equal(verifyCheckpointQr(qr,{...opts,siteId:'site2'}).ok,false);
 assert.deepEqual(verifyCheckpointQr(qr,{...opts,validCredentialIds:new Set()}),{ok:false,reason:'REVOKED'});
 const [head,sig]=qr.split('.'); const tampered=head.slice(0,-2)+'xx.'+sig;
 assert.deepEqual(verifyCheckpointQr(tampered,opts),{ok:false,reason:'INVALID_SIGNATURE'});
});
test('offline uses the same randomized schedule, binds assignments to session and reconciles duplicates',()=>{
 const state={deviceId:'company1',sessionId:'sA',guardId:'guardA',shiftId:'shiftA',siteId:'site1',policyVersion:1,lastAssignment:null,visits:[]};
 const a=generateOfflineAssignment(state,[{id:'gate',priority:1,minimumVisits:1}],{minIntervalMinutes:10,maxIntervalMinutes:35,shiftEndMs:now+3600000},now,()=>0,()=> 'task1');
 assert.equal(a?.dueAtMs,now+600000);assert.equal(a?.checkpointId,'gate');assert.equal(a?.sessionId,'sA');
 const event={eventId:'e',sessionId:'sA',deviceId:'company1',guardId:'guardA',shiftId:'shiftA',siteId:'site1',assignmentId:'task1',checkpointId:'gate',credentialId:'qr123',capturedAtMs:now+600010,enqueuedAtMs:now+600011,accuracyM:null};
 assert.equal(classifyOfflineScan(event,now+1200000,new Set()),'DELAYED');
 assert.equal(classifyOfflineScan(event,now+1200000,new Set(['e'])),'DUPLICATE');
 assert.equal(classifyOfflineScan({...event,capturedAtMs:now+86400001,enqueuedAtMs:now+86400002},now,new Set()),'FUTURE_CLOCK');
 assert.equal(generateOfflineAssignment({...state,lastAssignment:a},[{id:'gate',priority:1,minimumVisits:1}],{minIntervalMinutes:10,maxIntervalMinutes:35,shiftEndMs:now+3600000},now+1000,()=>0),null);
});
