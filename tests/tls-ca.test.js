const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {X509Certificate}=require('node:crypto');
const {databaseConfig}=require('../database-config');
const pem=fs.readFileSync(path.join(__dirname,'fixtures/supabase-public-ca.crt'),'utf8');
const fingerprint=new X509Certificate(pem).fingerprint256;
const base={NODE_ENV:'production',DATABASE_URL:'postgresql://fixture:unused@aws-0-us-west-2.pooler.supabase.com:5432/postgres',DATABASE_PASSWORD:'fixture-not-a-real-password'};
test('CA formatting is normalized without changing certificates or relaxing production TLS',()=>{
 const variants=[pem,pem.trim().split('\n').join('\n\n'),pem.replace(/\n/g,'\r\n'),pem.replace(/\n/g,'\\n'),pem.replace(/\n/g,'\\r\\n'),pem.replace(/\n/g,' ')];
 for(const variant of variants){const result=databaseConfig({...base,DATABASE_CA_CERT:variant,DATABASE_TEST_NO_TLS:'true'});assert.equal(result.options.ssl.rejectUnauthorized,true);assert.equal(new X509Certificate(result.options.ssl.ca.at(-1)).fingerprint256,fingerprint);assert.equal(result.options.password,base.DATABASE_PASSWORD);assert.equal(result.options.host,'aws-0-us-west-2.pooler.supabase.com');}
});
test('CA bundles retain all supplied certificates',()=>{const result=databaseConfig({...base,DATABASE_CA_CERT:pem+'\n'+pem});assert.equal(new X509Certificate(result.options.ssl.ca.at(-2)).fingerprint256,fingerprint);assert.equal(new X509Certificate(result.options.ssl.ca.at(-1)).fingerprint256,fingerprint);});
test('malformed CA values fail closed rather than being silently ignored',()=>{
 for(const bad of ['certificate.crt','https://example.test/ca.crt','"'+pem+'"',pem+'Port: 4173','-----BEGIN CERTIFICATE-----\nnot-a-cert\n-----END CERTIFICATE-----',pem.replace(/MIID/,'!!!!'), 'x'.repeat(140000)]) assert.throws(()=>databaseConfig({...base,DATABASE_CA_CERT:bad}),e=>e.code==='CONFIG_DATABASE_CA');
});
test('optional CA diagnostics distinguish absent, valid and invalid values without disclosing secrets',()=>{
 const logs=[], original=console.log;console.log=line=>logs.push(line);
 try {databaseConfig({...base,DATABASE_TLS_DIAGNOSTICS:'true'});databaseConfig({...base,DATABASE_TLS_DIAGNOSTICS:'true',DATABASE_CA_CERT:pem});assert.throws(()=>databaseConfig({...base,DATABASE_TLS_DIAGNOSTICS:'true',DATABASE_CA_CERT:'PRIVATE-INPUT-DO-NOT-LOG'}));}finally{console.log=original;}
 const text=logs.join('\n');assert.match(text,/runtime CA=missing/);assert.match(text,/runtime CA=present; parsed certificates=1/);assert.match(text,/runtime CA=present but invalid/);assert.match(text,/peer verification=enabled/);assert.ok(!text.includes(base.DATABASE_URL));assert.ok(!text.includes(base.DATABASE_PASSWORD));assert.ok(!text.includes('PRIVATE-INPUT-DO-NOT-LOG'));assert.ok(!text.includes('BEGIN CERTIFICATE'));
});
test('diagnostics remain opt-in',()=>{const original=console.log;let calls=0;console.log=()=>calls++;try{databaseConfig({...base,DATABASE_CA_CERT:pem});}finally{console.log=original;}assert.equal(calls,0);});
