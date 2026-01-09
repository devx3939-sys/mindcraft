#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { initBot } from './src/utils/mcdata.js';

// Lazy import actions list when needed
let actionsList = null;

// Minimal agent shim used when running actions from this simple CLI bot
async function createAgentShim(bot, agentName) {
  const memory = { places: {} };
  const agentShim = {
    name: agentName,
    bot,
    shut_up: false,
    last_sender: null,
    // placeholder history for compatibility
    history: {
      add: async () => {},
      save: async () => {}
    },
    openChat: (msg) => {
      try { bot.chat(String(msg)); } catch (e) {}
      console.log(`[agent:${agentName}] ${String(msg)}`);
    },
    clearBotLogs: () => { bot.output = ''; bot.interrupt_code = false; },
    cleanKill: (reason) => {
      try { bot.quit && bot.quit('cleanKill'); } catch (e) {}
      console.log(`[agent:${agentName}] cleanKill ${reason}`);
      process.exit(0);
    },
    requestInterrupt: () => {
      try {
        bot.interrupt_code = true;
        bot.stopDigging && bot.stopDigging();
        bot.collectBlock && bot.collectBlock.cancelTask && bot.collectBlock.cancelTask();
        bot.pathfinder && bot.pathfinder.stop && bot.pathfinder.stop();
        bot.pvp && bot.pvp.stop && bot.pvp.stop();
      } catch (e) {}
    },
    isIdle: () => !(agentShim.actions && agentShim.actions.executing),
    self_prompter: { isActive: () => false, setPromptPaused: () => {}, start: () => {}, stop: () => {}, isPaused: () => false },
    memory_bank: {
      rememberPlace: (name, x, y, z) => { memory.places[name] = [x, y, z]; },
      recallPlace: (name) => memory.places[name] || null
    },
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

  // attach a real ActionManager from the agent code so actions behave like the full agent
  try {
    const { ActionManager } = await import('./src/agent/action_manager.js');
    agentShim.actions = new ActionManager(agentShim);
  } catch (e) {
    // fallback minimal implementation
    agentShim.actions = {
      executing: false,
      currentActionLabel: '',
      runAction: async (label, fn, opts = {}) => {
        try {
          agentShim.actions.executing = true;
          agentShim.actions.currentActionLabel = label;
          bot.interrupt_code = false;
          await fn();
          agentShim.actions.executing = false;
          agentShim.actions.currentActionLabel = '';
          return { interrupted: false, timedout: false, message: 'ok' };
        } catch (err) {
          agentShim.actions.executing = false;
          agentShim.actions.currentActionLabel = '';
          return { interrupted: false, timedout: false, message: String(err) };
        }
      },
      stop: async () => { bot.interrupt_code = true; },
      cancelResume: () => {}
    };
  }

  // minimal prompter required by modes; full prompter isn't needed for CLI shim
  agentShim.prompter = {
    getInitModes: () => null,
    promptShouldRespondToBot: async () => true,
    setAgent: () => {}
  };

  // initialize modes so `bot.modes` exists and modes can pause/unpause
  try {
    const { initModes } = await import('./src/agent/modes.js');
    initModes(agentShim);
  } catch (e) {
    console.warn('Failed to init modes for agent shim:', e && e.message);
  }

  return agentShim;
}

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.split('=')[1];
  return undefined;
}

const host = getArg('--host') || getArg('--server') || 'localhost';
const port = getArg('--port') ? parseInt(getArg('--port')) : undefined;
const username = getArg('--username') || getArg('--user') || getArg('--username') || 'Bot';
const password = getArg('--password') || undefined;
const version = getArg('--version') || undefined;
const authTokenArg = getArg('--authToken') || undefined;
const savedServersPath = path.resolve(process.cwd(), 'data', 'saved_servers.json');

function loadSavedServerAuth(h, p) {
  try {
    if (!fs.existsSync(savedServersPath)) return null;
    const raw = fs.readFileSync(savedServersPath, 'utf8');
    const saved = JSON.parse(raw);
    const key = `${h}:${p}`;
    if (saved[key]) return saved[key];
    // try host only
    for (const k of Object.keys(saved)) {
      const s = saved[k];
      if (s.ip === h || s.ip === host) return s;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load saved servers:', err && err.message);
    return null;
  }
}

function buildOptions() {
  const opts = { host, username };
  if (port) opts.port = port;
  if (password) opts.password = password;
  if (version) opts.version = version;

  // prefer explicit auth token arg
  if (authTokenArg) {
    opts.auth = 'microsoft';
    opts.accessToken = authTokenArg;
    opts.session = { accessToken: authTokenArg };
    console.log('Using provided --authToken for Microsoft auth');
    return opts;
  }

  // load saved server token if available
  try {
    const saved = loadSavedServerAuth(host, port || '');
    if (saved && saved.auth === 'microsoft' && saved.authToken) {
      opts.auth = 'microsoft';
      opts.accessToken = saved.authToken;
      opts.session = { accessToken: saved.authToken };
      if (saved.authProfile && saved.authProfile.id) opts.session.selectedProfile = { id: saved.authProfile.id, name: saved.authProfile.name };
      if (opts.session.selectedProfile && opts.session.selectedProfile.name) opts.username = opts.session.selectedProfile.name;
      console.log(`Using saved Microsoft token for ${saved.name || host}:${saved.port}`);
      return opts;
    }
  } catch (e) {
    console.warn('Error while reading saved servers:', e && e.message);
  }

  // fallback to default (offline)
  return opts;
}

let reconnecting = false;
let bot = null;

async function startBot() {
  while (true) {
    try {
      const serverConfig = { host, port, auth: 'offline' };
      // If options indicate minecraft microsoft auth present, pass token
      const opts = buildOptions();
      if (opts.auth === 'microsoft' && opts.accessToken) {
        serverConfig.auth = 'microsoft';
        serverConfig.authToken = opts.accessToken;
        if (opts.session && opts.session.selectedProfile) serverConfig.authProfile = opts.session.selectedProfile;
      }

      console.log('Connecting with options:', Object.assign({}, serverConfig));

      // Start a full Agent so long-running tasks, modes, and learning brain are available
      try {
        const { Agent } = await import('./src/agent/agent.js');
        const settingsModule = await import('./src/agent/settings.js');
        // set CLI-specified host/port/auth into settings used by the Agent
        settingsModule.default.host = host;
        if (port) settingsModule.default.port = port;
        settingsModule.default.auth = serverConfig.auth;
        // set profile name so Prompter uses the desired username
        settingsModule.default.profile = Object.assign({}, settingsModule.default.profile || {}, { name: username });

        const agent = new Agent();
        await agent.start(false, null, 0);
        bot = agent.bot;

        bot.once('spawn', () => {
          console.log(`✅ Connected as ${agent.name || username} to ${host}:${port || '(default)'}`);
        });

        bot.on('chat', (username, message) => {
          console.log(`<${username}> ${message}`);
        });

        bot.on('kicked', (reason) => {
          console.log('Kicked:', reason);
        });

        bot.on('error', (err) => {
          console.error('Bot error:', err && err.message ? err.message : err);
        });

        bot.on('end', () => {
          console.log('Disconnected');
        });

        // expose agent for local commands
        bot._mindcraft_agent = agent;
      } catch (e) {
        console.warn('Failed to start full Agent, falling back to simple bot:', e && e.message);
        bot = initBot(username, serverConfig);
      }

      // attach stdin bridge
      try {
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', async (data) => {
          const msg = data.toString().trim();
          if (!msg || !bot) return;
          if (msg.startsWith('!')) {
            // local commands
            const parts = msg.slice(1).split(/\s+/);
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);
            if (cmd === 'quit' || cmd === 'exit') {
              console.log('Quit requested');
              try { bot._allowQuit = true; bot.quit && bot.quit('Quitting'); } catch (e) {}
              process.exit(0);
            } else if (cmd === 'say') {
              const text = args.join(' ');
              try { bot.chat(text); } catch (e) { console.warn('Chat failed', e && e.message); }
            } else {
              try {
                // lazy-load actionsList
                if (!actionsList) {
                  actionsList = (await import('./src/agent/commands/actions.js')).actionsList;
                }
              } catch (e) {
                console.warn('Failed to load actions list:', e && e.message);
              }

              const actionName = '!' + cmd;
              const actionObj = actionsList ? actionsList.find(a => a.name.toLowerCase() === actionName.toLowerCase()) : null;
              if (!actionObj) {
                console.log('Unknown local command:', cmd);
              } else {
                // prefer the real Agent if available (started earlier)
                let agentShim;
                if (bot._mindcraft_agent) {
                  agentShim = bot._mindcraft_agent;
                } else {
                  // create minimal agent shim (async, loads ActionManager and modes)
                  agentShim = await createAgentShim(bot, username);
                }
                // parse args into typed values
                const parsedArgs = args.map(a => {
                  if (!isNaN(Number(a))) return Number(a);
                  if ((a.startsWith('"') && a.endsWith('"')) || (a.startsWith("'") && a.endsWith("'"))) return a.slice(1,-1);
                  return a;
                });

                console.log(`Executing action ${actionName} with args:`, parsedArgs);
                try {
                  const res = await actionObj.perform(agentShim, ...parsedArgs);
                  console.log('Action completed:', res);
                } catch (err) {
                  console.error('Action failed:', err && err.message ? err.message : err);
                }
              }
            }
          } else {
            // send normal chat
            try { bot.chat(msg); } catch (e) { console.warn('Chat send failed', e && e.message); }
          }
        });
      } catch (e) {
        /* ignore stdin attach failures */
      }

      // Wait for end or error
      await new Promise((resolve) => {
        bot.once('end', resolve);
        bot.once('kicked', resolve);
        bot.once('error', resolve);
      });

      // Cleanup agent styles
      try { bot.pathfinder && bot.pathfinder.stop && bot.pathfinder.stop(); } catch (e) {}
      try { bot.collectBlock && bot.collectBlock.cancelTask && bot.collectBlock.cancelTask(); } catch (e) {}
      try { bot.pvp && bot.pvp.stop && bot.pvp.stop(); } catch (e) {}

      // Wait before reconnect
      if (!reconnecting) reconnecting = true;
      console.log('Reconnecting in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      reconnecting = false;

      // Wait before reconnect
      if (!reconnecting) reconnecting = true;
      console.log('Reconnecting in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      reconnecting = false;
    } catch (err) {
      console.error('Fatal bot loop error:', err && err.message ? err.message : err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

startBot().catch(err => {
  console.error('Bot failed:', err && err.message ? err.message : err);
  process.exit(1);
});
