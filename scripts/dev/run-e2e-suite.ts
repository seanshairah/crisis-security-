import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const u=new URL(process.env.DATABASE_URL??'http://missing');
if(!['localhost','127.0.0.1'].includes(u.hostname)||u.port!=='55439'||u.pathname!=='/crisis_test'||process.env.APP_URL!=='http://localhost:3141')throw Error('Use the isolated crisis_test database and portal on localhost:3141');
async function main(){const {db}=await import('../../src/lib/db');try{
 for(const script of ['gateway-e2e','location-e2e','alerts-e2e','integration-e2e','location-request-e2e']){
  // Isolate unrelated fixtures; limiter correctness has its own adversarial integration suite.
  await db.securityRateBucket.deleteMany();
  const r=spawnSync(process.execPath,[resolve('node_modules/tsx/dist/cli.mjs'),`scripts/dev/${script}.ts`],{stdio:'inherit',env:process.env});
  if(r.status!==0)throw Error(`${script} failed`);
 }
}finally{await db.$disconnect();}}main().catch(e=>{console.error(e);process.exitCode=1;});
