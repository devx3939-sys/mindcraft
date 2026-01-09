#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.split('=')[1];
  return undefined;
}

const host = getArg('--host') || 'localhost';
const port = getArg('--port') || '25565';
const clientId = '00000000402b5328';
const scope = 'XboxLive.signin offline_access';
const savedServersPath = path.resolve(process.cwd(), 'data', 'saved_servers.json');

async function startDeviceFlow() {
  console.log(`Starting device flow for ${host}:${port}...`);
  const body = new URLSearchParams();
  body.append('client_id', clientId);
  body.append('scope', scope);

  const resp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
  });

  if (!resp.ok) {
    console.error('Device flow start failed', await resp.text());
    process.exit(1);
  }

  const data = await resp.json();
  console.log('Open this URL in your browser:', data.verification_uri || data.verification_uri_complete);
  console.log('Enter the code:', data.user_code);
  console.log('Waiting for authorization...');

  const expiresAt = Date.now() + (parseInt(data.expires_in || 900) * 1000);
  const interval = parseInt(data.interval || 5) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(r => setTimeout(r, interval));
    const pollBody = new URLSearchParams();
    pollBody.append('client_id', clientId);
    pollBody.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
    pollBody.append('device_code', data.device_code);

    const tokenResp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: pollBody.toString()
    });

    const tokenJson = await tokenResp.json();
    if (tokenJson.error) {
      if (tokenJson.error === 'authorization_pending') continue;
      console.error('Auth failed:', tokenJson);
      process.exit(1);
    }

    // We have MS tokens
    const msAccessToken = tokenJson.access_token;
    const msRefreshToken = tokenJson.refresh_token;

    console.log('Microsoft token obtained. Exchanging to Minecraft token...');

    // XBL
    const xboxResp = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` }, RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT' })
    });
    if (!xboxResp.ok) { console.error('Xbox auth failed', await xboxResp.text()); process.exit(1); }
    const xboxData = await xboxResp.json();
    const xblToken = xboxData.Token;
    const uhs = xboxData.DisplayClaims?.xui?.[0]?.uhs;

    const xstsResp = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT' })
    });
    if (!xstsResp.ok) { console.error('XSTS auth failed', await xstsResp.text()); process.exit(1); }
    const xstsData = await xstsResp.json();
    const xstsToken = xstsData?.Token;

    const mcResp = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` })
    });
    if (!mcResp.ok) { console.error('Minecraft login failed', await mcResp.text()); process.exit(1); }
    const mcData = await mcResp.json();
    const mcAccessToken = mcData.access_token;

    const profileResp = await fetch('https://api.minecraftservices.com/minecraft/profile', { headers: { 'Authorization': `Bearer ${mcAccessToken}` } });
    if (!profileResp.ok) { console.error('Failed to get profile', await profileResp.text()); process.exit(1); }
    const profile = await profileResp.json();

    console.log(`Authenticated Minecraft profile: ${profile.name} (${profile.id})`);

    // Save to data/saved_servers.json
    let saved = {};
    try { if (fs.existsSync(savedServersPath)) saved = JSON.parse(fs.readFileSync(savedServersPath, 'utf8')); } catch (e) { console.warn('Could not read saved servers file, creating new'); }
    const key = `${host}:${port}`;
    saved[key] = { id: key, name: host, ip: host, port: parseInt(port), auth: 'microsoft', authToken: mcAccessToken, authProfile: { id: profile.id, name: profile.name }, msRefreshToken, savedAt: new Date().toISOString() };
    try { fs.mkdirSync(path.dirname(savedServersPath), { recursive: true }); fs.writeFileSync(savedServersPath, JSON.stringify(saved, null, 2)); console.log('Saved server auth to', savedServersPath); } catch (e) { console.error('Failed to persist saved server', e && e.message); }

    console.log('Device auth complete. You can now run: node bot.js --host', host, '--port', port, '--username', profile.name);
    process.exit(0);
  }

  console.error('Device code expired or timed out');
  process.exit(1);
}

startDeviceFlow().catch(err => { console.error('Auth CLI error:', err && err.message); process.exit(1); });