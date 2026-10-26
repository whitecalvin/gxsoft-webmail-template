# Public HTTPS proxy recovery

> Historical recovery record, not a current uptime claim. The subsequently requested direct `103 -> 192.168.0.105:7540` transition was not completed in this session: Windows administrator application was blocked. `scripts/enable-lan-webmail.ps1` prepares the restricted LAN mapping; validate it from103 before switching Nginx and removing the temporary relay. Committing these scripts does not apply network changes.

## Confirmed cause and applied change

- Public DNS resolves to 221.151.221.23; TLS succeeds. The serving Nginx 1.31.6 is on 192.168.0.103.
- Its `/etc/nginx/conf.d/vhost_gxsoft.conf` webmail-test HTTPS block forwarded three locations to `http://192.168.0.105` (implicit port 80). Error logs confirmed connection timeouts to that exact upstream and public HTTP 504.
- Existing local webmail serves HTTP 200 on `127.0.0.1:7540`; no webmail restart, new build, credentials, API configuration, firewall opening, or mail changes were needed.
- Started host-key-verified SSH reverse forwarding from this PC: `127.0.0.1:17540` on the proxy to `127.0.0.1:7540` locally. Remote listener was verified as loopback only.
- Replaced only the three upstream lines for this domain with `http://127.0.0.1:17540`. SSE buffering settings, HTTPS, forwarded headers, body limits and WebSocket forwarding were preserved.
- Hash-guarded backup: `/etc/nginx/conf.d/vhost_gxsoft.conf.before-public-relay-20261021`. Nginx configuration tests succeeded before/after; reload succeeded. No unrelated vhost changed.

## Verification

- Direct proxy HTTPS `/ko/login`: HTTP 200.
- Public HTTPS `/ko/login`: HTTP 200 after reload. A request overlapping the reload still observed the old 504; subsequent fresh requests succeeded.
- Public `/api/mail/health`: HTTP 200.
- Public `/ko`: HTTP 307 to `/ko/login`; anonymous `/api/mail/security`: HTTP 401. Existing authentication protection was preserved.
- Two login CSS assets: HTTP 200 with CSS content type.
- Configuration diff: exactly three upstream substitutions.
- Relay helper PowerShell syntax and duplicate-process handling passed (reused the owned PID; no second tunnel started). Python replacement, concurrent-change and location-count guards passed with synthetic data on the proxy; the local Windows Python alias was unavailable.
- No application source/build input changed in this recovery, so app compilation and unrelated application suites were not repeated.
- Authentication, Google consent, and existing mail mutations are outside this recovery check.

## Lifetime and restart

This is an encrypted development relay, not a deployed production webmail service. The local webmail and SSH relay must both remain running; PC shutdown or SSH failure takes this test site offline. Keep local webmail loopback-bound. No automatic-start service or scheduled task was installed.

To restart the relay after local webmail is ready:

```powershell
powershell -NoProfile -File scripts/start-public-relay.ps1
```

The helper refuses an occupied remote port and does not stop existing processes. It uses strict host-key checking, batch authentication, forwarding failure detection and SSH keepalives. It reports the owned PID and log path. Verify the public login URL after starting; a process start alone is not a health check. A running SSH process is not proof of current end-to-end availability.

For rollback, compare the current vhost with the backup first and restore only this domain's three lines if there have been concurrent changes. Validate with `nginx -t` before reloading. Stop only the owned relay PID if it is no longer needed; restoring the original upstream will restore the original outage until a different backend is provided.
