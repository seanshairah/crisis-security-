import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { policySchema, checkpointSchema, scanSchema } from '../../src/lib/patrol/validation';
const contracts = { policy: policySchema, checkpoint: checkpointSchema, scan: scanSchema };
const document = {
 title:'Crisis patrol request contracts',
 authentication:'Device routes use the company device bearer token; admin routes require the portal session.',
 routes:{'POST /api/patrols/events':{body:'{ sentAt: ISO datetime, events: scan[] }',maximumSubmitted:100,maximumProcessed:20,acknowledgements:['ok','duplicate','rejected','retry'],notes:'Unacknowledged and retry rows must remain on the device. Missing/invalid sentAt requires clock review. Excessively delayed evidence requires review.'},'POST /api/patrols/session':{body:'{ guardNo: string, pin: string }',note:'A shared device plus the scheduled guard and strong individual PIN is required.'}},
 schemas:Object.fromEntries(Object.entries(contracts).map(([name,schema])=>[name,z.toJSONSchema(schema,{io:'input',unrepresentable:'any'})])),
};
mkdirSync('docs/generated',{recursive:true});const path='docs/generated/patrol-api.json';const content=JSON.stringify(document,null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==content)throw Error('Run npm run docs:api to update schema contracts');}
else writeFileSync(path,content);
