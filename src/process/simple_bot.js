import { io } from 'socket.io-client';
import mineflayer from 'mineflayer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('name', { type: 'string' })
  .option('host', { type: 'string' })
  .option('port', { type: 'number' })
  .option('username', { type: 'string' })
  .option('authMode', { type: 'string', default: 'offline' })
  .option('authToken', { type: 'string' })
  .option('authProfile', { type: 'string' })
  .option('version', { type: 'string' })
  .option('mindserver', { type: 'number', default: 8080 })
  .argv;

const name = argv.name || argv.username || 'SimpleAgent';
const host = argv.host || 'localhost';
const port = argv.port || 25565;
const authMode = argv.authMode || 'offline';
const authToken = argv.authToken || null;
const authProfile = argv.authProfile ? JSON.parse(argv.authProfile) : null;
const mindserverPort = argv.mindserver || 8080;
const version = argv.version || undefined;

async function connectToMindServer() {
  const socket = io(`http://localhost:${mindserverPort}`);
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', (err) => reject(err));
  });
  console.log(`${name} connected to MindServer`);
  // tell MindServer about this process
  socket.emit('connect-agent-process', name);

  socket.on('restart-agent', (agentName) => {
    if (agentName === name) {
      console.log('Received restart-agent, exiting to allow restart');
      process.exit(2);
    }
  });

  return socket;
}

import { initBot } from '../utils/mcdata.js';
import { initModes } from '../agent/modes.js';

function buildServerConfig() {
  const cfg = { host, port, auth: authMode };
  if (version) cfg.version = version;
  if (authMode === 'microsoft') {
    if (authToken) {
      cfg.authToken = authToken;
      if (authProfile) cfg.authProfile = authProfile;
      console.log('[simple_bot] Using provided Microsoft auth token for', name);
    } else {
      console.warn('[simple_bot] Microsoft auth selected but no authToken provided. Connection may fail.');
    }
  }
  return cfg;
}

async function startBotLoop() {
  const socket = await connectToMindServer();

  // Track the currently active mineflayer bot instance so we can direct commands to it
  let currentBot = null;

  // Import actions list lazily to avoid heavy startup cost
  let actionsList = null;
  try {
    actionsList = (await import('../agent/commands/actions.js')).actionsList;
  } catch (e) {
    console.warn('[simple_bot] Could not import actions list; action commands will be unavailable.', e && e.message);
  }

  // Execute structured commands sent via MindServer (from UI or LLM bridge)
  socket.on('execute-command', async (payload, callback) => {
    try {
      if (!payload || !payload.type) {
        const err = { success: false, error: 'invalid payload' };
        if (callback) callback(err);
        return;
      }
      if (!currentBot) {
        const err = { success: false, error: 'bot-not-connected' };
        if (callback) callback(err);
        return;
      }

      console.log(`[simple_bot] Received command for ${name}:`, payload);

      // If payload indicates an action name, try to run the full action harness
      if ((payload.type === 'action' || payload.actionName) && actionsList) {
        const actionName = payload.actionName || payload.action || payload.name;
        let normalized = actionName && actionName.startsWith('!') ? actionName : `!${actionName}`;
        const actionObj = actionsList.find(a => a.name === normalized);
        if (!actionObj) {
          const err = { success: false, error: 'action-not-found', message: `Action ${normalized} not found` };
          if (callback) callback(err);
          return;
        }

        // Create an agent compatibility shim so actions can operate against the simple bot
        const agentShim = createAgentShim(currentBot, name, socket);

        // Support args array or single param
        let args = [];
        if (Array.isArray(payload.args)) args = payload.args;
        else if (payload.arg !== undefined) args = [payload.arg];
        else if (payload.params) args = payload.params;
        else if (payload.text !== undefined) args = [payload.text];

        let result;
        try {
          result = await actionObj.perform(agentShim, ...args);
        } catch (e) {
          result = { ok: false, error: String(e) };
        }

        try { socket.emit('command-result', name, payload.id || null, { action: normalized, result }); } catch (e) {}
        if (callback) callback({ success: true, result });
        return;
      }

      const result = await executeCommand(currentBot, payload);

      // Emit a command-result event back to the MindServer so UI/bridges can observe outcomes
      try { socket.emit('command-result', name, payload.id || null, result); } catch (e) {}

      if (callback) callback({ success: true, result });
    } catch (err) {
      console.error('[simple_bot] Error executing command:', err);
      if (callback) callback({ success: false, error: String(err) });
    }
  });

  // Small shim to provide a minimal agent API expected by actions
  function createAgentShim(bot, agentName, socket) {
    const memory = { places: {} };
    return {
      name: agentName,
      bot,
      // simple output helper
      openChat: (msg) => {
        try { bot.chat(String(msg)); } catch (e) { /* best-effort */ }
        try { socket.emit('bot-output', agentName, String(msg)); } catch (e) {}
      },
      clearBotLogs: () => { bot.output = ''; },
      cleanKill: (reason) => {
        try { socket.emit('bot-output', agentName, `cleanKill: ${reason}`); } catch (e) {}
        try { bot.quit(); } catch (e) {}
      },
      actions: {
        runAction: async (label, actionFn, opts = {}) => {
          // Very small wrapper: execute actionFn and return expected shape
          try {
            bot.interrupt_code = false;
            await actionFn();
            return { interrupted: false, timedout: false, message: 'ok' };
          } catch (e) {
            return { interrupted: false, timedout: false, message: String(e) };
          }
        },
        stop: async () => { bot.interrupt_code = true; },
        cancelResume: () => {}
      },
      self_prompter: {
        isActive: () => false,
        setPromptPaused: () => {},
        start: () => {},
        stop: () => {}
      },
      memory_bank: {
        rememberPlace: (name, x, y, z) => { memory.places[name] = [x, y, z]; },
        recallPlace: (name) => memory.places[name] || null
      },
      // vision shim for a few actions
      vision_interpreter: {
        lookAtPlayer: async (player_name, direction) => {
          const playerEntry = bot.players[player_name];
          if (!playerEntry || !playerEntry.entity) return `Player ${player_name} not found`;
          const pos = playerEntry.entity.position;
          await bot.lookAt(pos);
          return `Looked ${direction} ${player_name}`;
        },
        lookAtPosition: async (x, y, z) => { await bot.lookAt({ x, y, z }); return 'Looked at position'; }
      }
    };
  }

  // Provide a small state snapshot when MindServer polls for it
  socket.on('get-full-state', (cb) => {
    if (!currentBot || !currentBot.entity) {
      return cb({ inGame: false });
    }
    const pos = currentBot.entity.position || null;
    cb({
      inGame: true,
      username: currentBot.username,
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
      health: currentBot.health || null
    });
  });

  // Helper to map small set of commands to mineflayer actions
  async function executeCommand(bot, cmd) {
    // cmd: { id?, type: 'chat'|'raw'|'dig'|'swing'|'respawn', text?, pos?, blockType? }
    try {
      if (cmd.type === 'chat') {
        if (!cmd.text) return { ok: false, error: 'no text' };
        bot.chat(cmd.text);
        return { ok: true };
      }

      if (cmd.type === 'raw') {
        // send a raw chat command (starts with /)
        if (!cmd.text) return { ok: false, error: 'no text' };
        bot.chat(cmd.text);
        return { ok: true };
      }

      if (cmd.type === 'swing') {
        try {
          if (typeof bot.swingArm === 'function') bot.swingArm();
          return { ok: true };
        } catch (e) { return { ok: false, error: String(e) }; }
      }

      if (cmd.type === 'dig') {
        // Accept pos: {x,y,z} or blockType string
        if (cmd.pos) {
          const b = bot.blockAt(cmd.pos);
          if (!b) return { ok: false, error: 'no block at pos' };
          await bot.dig(b);
          return { ok: true };
        }
        if (cmd.blockType) {
          const b = bot.findBlock({ matching: (blk) => blk.name === cmd.blockType });
          if (!b) return { ok: false, error: `no block of type ${cmd.blockType} found` };
          await bot.dig(b);
          return { ok: true };
        }
        return { ok: false, error: 'missing pos or blockType' };
      }

      if (cmd.type === 'respawn') {
        // best-effort: try respawn by sending chat command
        bot.chat('/kill');
        return { ok: true };
      }

      return { ok: false, error: 'unknown command type' };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  let backoff = 1000;
  while (true) {
    try {
      const serverConfig = buildServerConfig();
      console.log(`[simple_bot] Creating bot ${name} -> ${host}:${port} with auth ${serverConfig.auth || 'offline'}`);
      const bot = initBot(name, serverConfig);

      currentBot = bot;

      bot.on('spawn', () => {
        console.log(`${name} spawned in world.`);
        try { socket.emit('login-agent', name); } catch (e) {}

        // Initialize a light-weight modes/prompter shim so action modes work
        try {
          const shim = createAgentShim(bot, name, socket);
          // provide a minimal promper so initModes won't crash
          shim.prompter = { getInitModes: () => null };
          initModes(shim);

          // setup auto-eat defaults (similar to full Agent)
          if (bot.autoEat && bot.autoEat.options) {
            bot.autoEat.options = {
              priority: 'foodPoints',
              startAt: 14,
              bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };
          }
        } catch (err) {
          console.warn('[simple_bot] Failed to init modes or autoEat options:', err && err.message ? err.message : err);
        }
      });

      bot.on('kicked', (reason) => {
        console.log(`${name} kicked:`, reason);
      });

      bot.on('error', (err) => {
        console.error(`${name} encountered error:`, err && err.message ? err.message : err);
      });

      bot.on('end', () => {
        console.log(`${name} disconnected from server. Will attempt reconnect.`);
        currentBot = null;
      });

      // Wait until bot ends then loop to reconnect
      await new Promise((resolve) => {
        bot.once('end', resolve);
        bot.once('kicked', resolve);
        bot.once('error', resolve);
      });

      // small backoff before reconnect
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60000);
      console.log(`${name} reconnecting after backoff ${backoff}ms`);
    } catch (err) {
      console.error('[simple_bot] Fatal error in bot loop:', err && err.message ? err.message : err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

startBotLoop().catch(err => {
  console.error('simple_bot failed:', err && err.message ? err.message : err);
  process.exit(1);
});