import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const requested=process.argv.slice(2);
const tests=requested.length?requested:readdirSync("scripts").filter(f=>/^test-.*\.mjs$/.test(f)).sort();
let passed=0;
for(const test of tests) {
  const result=spawnSync(process.execPath,[`scripts/${test}`],{encoding:"utf8",windowsHide:true,timeout:60_000,maxBuffer:2*1024*1024});
  if(result.status===0)passed++;
  else console.log(`FAIL ${test}\n${(result.stdout+result.stderr).slice(-4000)}`);
}
console.log(`Unit checks: ${passed}/${tests.length} passed`);
process.exitCode=passed===tests.length?0:1;
