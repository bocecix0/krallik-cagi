// Remote play/dev from anywhere (home, 4G...) without Expo's ngrok tunnel:
//   npm run uzak
// Picks a free port, opens a free Cloudflare quick tunnel to it, then starts Expo on that same port with
// EXPO_PACKAGER_PROXY_URL so the Expo Go manifest points at the public https address. Keep this window open.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

function findCloudflared() {
  const probe = spawnSync('cloudflared --version', { shell: true });
  if (probe.status === 0) return 'cloudflared';
  const root = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  try {
    for (const d of fs.readdirSync(root)) {
      if (!d.startsWith('Cloudflare.cloudflared')) continue;
      const exe = path.join(root, d, 'cloudflared.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch { /* not installed via winget */ }
  console.error('cloudflared bulunamadı. Kurmak için: winget install Cloudflare.cloudflared');
  process.exit(1);
}

/** first port in [from, from+20) nobody listens on (Metro binds on all interfaces) */
async function freePort(from) {
  for (let p = from; p < from + 20; p++) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(p);
    });
    if (ok) return p;
  }
  throw new Error('Boş port bulunamadı');
}

const PORT = await freePort(Number(process.env.PORT ?? 8081));
if (PORT !== 8081) console.log(`8081 dolu, ${PORT} portu kullanılıyor.`);

const bin = findCloudflared();
console.log('Cloudflare tüneli açılıyor...');
const cf = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Tünel 60 sn içinde açılmadı')), 60000);
  const onData = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { clearTimeout(timer); resolve(m[0]); }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);
  cf.on('exit', (code) => reject(new Error(`cloudflared kapandı (kod ${code})`)));
}).catch((e) => { console.error(e.message); cf.kill(); process.exit(1); });

const host = url.replace('https://', '');
const line = '─'.repeat(64);
console.log(`\n${line}\n  Telefonda Expo Go ile aç:   exps://${host}\n  Tarayıcıdan oyna:           ${url}\n${line}`);
// terminal QR for Expo Go (python + segno when available; the link above always works)
spawnSync('python', ['-c', `import segno; segno.make('exps://${host}', error='l').terminal(compact=True)`], { stdio: 'inherit' });
console.log('  ↑ Bu QR\'ı (ya da yukarıdaki exps:// linkini) kullan. Expo\'nun aşağıda çizdiği QR da aynı adrese gider.\n');

const expo = spawn(`npx expo start --port ${PORT}`, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
});

const stop = () => { try { cf.kill(); } catch { /* already gone */ } try { expo.kill(); } catch { /* already gone */ } process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => { try { cf.kill(); } catch { /* ignore */ } });
expo.on('exit', stop);
