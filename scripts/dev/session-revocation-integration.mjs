import assert from 'node:assert/strict';
import { request } from 'playwright-core';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
const u=new URL(process.env.DATABASE_URL??'http://missing');
if(u.hostname!=='127.0.0.1'||u.port!=='55439'||u.pathname!=='/crisis_test')throw Error('Disposable database only');
const base='http://localhost:3141';const db=new PrismaClient();const contexts=[];
try {
 const email=`${randomUUID()}@test.invalid`,password=randomUUID(),next=randomUUID();
 const user=await db.user.create({data:{name:'Session verification',email,passwordHash:await bcrypt.hash(password,12),role:'SUPER_ADMIN'}});
 async function login(p){const c=await request.newContext({baseURL:base});contexts.push(c);assert.equal((await c.post('/api/auth/login',{data:{email,password:p}})).status(),200);return c;}
 const a=await login(password),b=await login(password);
 assert.equal((await b.get('/api/users')).status(),200);
 assert.equal((await a.patch(`/api/users/${user.id}`,{data:{password:next}})).status(),200);
 assert.equal((await a.get('/api/users')).status(),401);assert.equal((await b.get('/api/users')).status(),401);
 const c=await login(next);assert.equal((await c.get('/api/users')).status(),200);
 const state=await c.storageState();const cookie=state.cookies.map(x=>`${x.name}=${x.value}`).join('; ');
 assert.equal((await c.post('/api/auth/logout',{maxRedirects:0})).status(),303);
 const replay=await request.newContext({baseURL:base,extraHTTPHeaders:{cookie}});contexts.push(replay);
 assert.equal((await replay.get('/api/users')).status(),401);
 assert.equal((await replay.get('/api/auth/logout',{maxRedirects:0})).status(),405);
 console.log('PASS: password reset revokes two independent sessions; logout rejects stolen-cookie replay; GET cannot revoke sessions.');
}finally{for(const c of contexts)await c.dispose();await db.$disconnect();}
