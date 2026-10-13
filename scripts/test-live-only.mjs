import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
function scan(dir) { return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(`${dir}/${e.name}`):[`${dir}/${e.name}`]); }
for(const path of ["app","components","context","lib"].flatMap(scan).filter(p=>/\.tsx?$/.test(p))) {
  assert.doesNotMatch(path,/mock-|Mock/);
  assert.doesNotMatch(readFileSync(path,"utf8"),/\bmock\b|MOCK_EMAILS|CURRENT_USER|mock_only/i,path);
}
const source=readFileSync("lib/tastemail/server.ts","utf8"), exports={};
new Function("exports","require",ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>({}));
const previous=process.env.GXWEBMAIL_DATA_MODE;
try {
  for(const value of [undefined,"mock","live","invalid"]) {
    if(value===undefined)delete process.env.GXWEBMAIL_DATA_MODE;else process.env.GXWEBMAIL_DATA_MODE=value;
    assert.equal(exports.mailDataMode(),"live");
  }
} finally { if(previous===undefined)delete process.env.GXWEBMAIL_DATA_MODE;else process.env.GXWEBMAIL_DATA_MODE=previous; }
const settings=readFileSync("components/settings/SettingsSectionPage.tsx","utf8");
assert.match(settings,/"inbox-display": InboxSettingsView/);
assert.doesNotMatch(readFileSync("lib/user-settings.ts","utf8"),/Project Atlas|Jiwoo Han|02-1234|team@gxsoft/);
console.log("Live-only runtime, authenticated data boundaries, empty defaults and inbox settings passed");
