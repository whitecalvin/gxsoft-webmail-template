// 합성 회귀가 실수로 운영 서버/외부 공급자에 연결하지 못하도록 native I/O를 차단합니다.
// 이 preload는 로컬 단위 시험 전용이며 애플리케이션 코드에서 import하지 않습니다.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";

function denied() { throw new Error("Offline regression forbids native network I/O; inject a synthetic transport"); }
globalThis.fetch = denied;
http.request = denied;
http.get = denied;
https.request = denied;
https.get = denied;
net.connect = denied;
net.createConnection = denied;
tls.connect = denied;
syncBuiltinESMExports();
