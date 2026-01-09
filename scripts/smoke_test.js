#!/usr/bin/env node
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import io from 'socket.io-client';

const BOT_NAME = process.env.SMOKE_BOT_NAME || 'SmokeBot';
const HOST = process.env.SMOKE_HOST || 'localhost';
const PORT = process.env.SMOKE_PORT || 25565;
const MINDSERVER = process.env.MINDSERVER || 'http://localhost:8080';

async function waitForBotInGame(name, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${MINDSERVER}/api/bots`);
      const data = await res.json();
      const bot = data.bots.find(b => b.name === name && b.inGame === true);
      if (bot) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

(async () => {
  console.log('Starting smoke test...');

  const botProcess = spawn(process.execPath, ['bot.js', '--host', HOST, '--port', String(PORT), '--username', BOT_NAME], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  botProcess.stdout.on('data', (d) => process.stdout.write(`[bot stdout] ${d}`));
  botProcess.stderr.on('data', (d) => process.stderr.write(`[bot stderr] ${d}`));

  try {
    const ok = await waitForBotInGame(BOT_NAME, 90000);
    if (!ok) throw new Error('Bot did not appear in game within timeout');
    console.log('Bot is in game, sending test commands...');

    // Connect to MindServer socket to listen for results
    const socket = io(MINDSERVER);
    socket.on('connect', () => console.log('Connected to MindServer socket'));
    socket.on('command-result', (agentName, commandId, result) => {
      console.log('command-result', agentName, commandId, result);
    });
    socket.on('bot-output', (agentName, message) => {
      console.log('bot-output', agentName, message);
    });

    // Send a series of commands
    const commands = [
      { type: 'action', actionName: 'stats' },
      { type: 'action', actionName: 'mine', args: ['stone', 1] },
      { type: 'action', actionName: 'goToCoordinates', args: [Math.floor(Math.random()*10), 64, Math.floor(Math.random()*10), 1] }
    ];

    for (const cmd of commands) {
      const res = await fetch(`${MINDSERVER}/api/agents/${encodeURIComponent(BOT_NAME)}/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd)
      });
      console.log('POST ack:', await res.json());
      await new Promise(r => setTimeout(r, 5000));
    }

    console.log('Smoke test complete — cleaning up');
    socket.disconnect();
  } catch (err) {
    console.error('Smoke test failed:', err);
  } finally {
    try { botProcess.kill(); } catch (e) {}
    process.exit(0);
  }
})();
