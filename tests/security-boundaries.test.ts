import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../src/lib/security/client-ip';
import { publicFailure, DomainError } from '../src/lib/security/api-errors';
import { hashGuardPin } from '../src/lib/patrol/shared-device';
test('proxy headers are ignored unless the ingress is explicitly trusted',()=>{
 const req={headers:new Headers({'x-forwarded-for':'203.0.113.6, 198.51.100.8','x-real-ip':'203.0.113.9'})};
 assert.equal(clientIp(req,0),null);assert.equal(clientIp(req,1),'198.51.100.8');assert.equal(clientIp(req,2),'203.0.113.6');
 assert.equal(clientIp({headers:new Headers({'x-forwarded-for':'spoof, invalid'})},1),null);
});
test('API boundaries expose expected domain errors and conceal infrastructure details',()=>{
 assert.equal(publicFailure(new DomainError('Session not found')).status,404);
 const old=console.error;console.error=()=>{};
 try {const result=publicFailure(new Error('secret database table/path/connection'));assert.equal(result.retryable,true);assert.ok(!result.message.includes('secret'));}
 finally{console.error=old;}
});
test('new guard PINs reject common sequential or repeated values',async()=>{
 for(const pin of ['000000','123456','654321','12345678'])await assert.rejects(hashGuardPin(pin),/repeated|sequential/);
 assert.match(await hashGuardPin('746291'),/^scrypt-v1:/);
});
