import mineflayer from 'mineflayer';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import * as skills from '../library/skills.js';

// Adapted UltimateBotBrain from user-provided implementation
export class UltimateBotBrain extends EventEmitter {
  constructor(botName = 'UltimateBot', options = {}) {
    super();
    this.botName = botName;
    this.dataDir = options.dataDir || path.join(process.cwd(), 'data', 'bot_brain', botName);
    // dedicated sessions folder for cleaner organization
    this.sessionsDir = path.join(this.dataDir, 'sessions');
    this.maxSaves = 10;
    this.bot = null;
    this._attachedBot = null;
    this._handlers = {};

    this.session = {
      id: crypto.randomBytes(16).toString('hex'),
      startTime: Date.now(),
      endTime: null,
      actions: [],
      movements: [],
      blocks: { placed: [], broken: [], interacted: [] },
      combat: { attacks: [], damageReceived: [], kills: [], deaths: [] },
      inventory: { pickups: [], drops: [], crafts: [], smelts: [], trades: [], snapshots: [] },
      world: { chunks: new Set(), biomes: new Set(), structures: [], discovered: [] },
      players: { seen: new Set(), interactions: [], chat: [], trades: [] },
      entities: { seen: new Set(), interactions: [], spawns: [], despawns: [] },
      environment: { weather: [], timeOfDay: [], position: [] },
      errors: [],
      failures: [],
      warnings: [],
      performance: this.initMetrics(),
      stateSnapshots: []
    };

    this.brain = { weights: {}, biases: {}, learningRate: 0.015, momentum: 0.9, previousGradients: {} };
    this.patterns = { successful: {}, failed: {}, optimal: {} };
    this.metrics = { survivalTime: 0, efficiency: {}, resourceGathering: {}, combatSuccess: 0, explorationRange: 0, adaptability: 0 };
    this.predictions = { dangerZones: [], safeZones: [], resourceLocations: {}, mobSpawns: {}, playerBehavior: {} };
  }

  initMetrics() {
    return {
      pvp: { wins: 0, losses: 0, damage: 0, accuracy: 0, score: 0 },
      mining: { blocks: 0, ores: 0, efficiency: 0, deaths: 0, score: 0 },
      crafting: { items: 0, recipes: 0, speed: 0, waste: 0, score: 0 },
      building: { placed: 0, structures: 0, quality: 0, time: 0, score: 0 },
      farming: { crops: 0, harvest: 0, yield: 0, automation: 0, score: 0 },
      breeding: { animals: 0, success: 0, efficiency: 0, score: 0 },
      trading: { trades: 0, profit: 0, efficiency: 0, score: 0 },
      survival: { time: 0, health: 0, food: 0, deaths: 0, score: 0 },
      exploration: { distance: 0, biomes: 0, structures: 0, score: 0 },
      navigation: { accuracy: 0, pathfinding: 0, obstacles: 0, score: 0 },
      overall: { score: 0, rank: 'Beginner', sessions: 0 }
    };
  }

  async initialize(bot) {
    // If previously attached to another bot, detach handlers
    if (this._attachedBot && this._attachedBot !== bot) {
      try { this.detachHandlers(); } catch(e) { /* ignore */ }
    }
    this.bot = bot;
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await this.loadAllKnowledge();
    this.attachHandlers(bot);
    this.startMonitoring();
    console.log(`[BRAIN] 🧠 Ultimate learning system initialized for ${this.botName}`);
  }

  // Start a lightweight training loop that performs simple tasks to improve the brain
  async startTraining(loopIntervalMs = 30000) {
    if (this.training) return;
    // ensure directories exist so autosave/write works even if initialize wasn't called
    await fs.mkdir(this.dataDir, { recursive: true }).catch(()=>{});
    await fs.mkdir(this.sessionsDir, { recursive: true }).catch(()=>{});
    this.training = true;
    this._trainingAbort = false;
    this.trainingStage = 0; // progression stage index
    console.log('[BRAIN] ▶️ Training started for', this.botName);

    const stages = [
      { name: 'sustain', desc: 'Gather food and basic supplies' },
      { name: 'wood_stone', desc: 'Collect wood and stone for tools' },
      { name: 'tools', desc: 'Craft basic tools' },
      { name: 'iron', desc: 'Mine and smelt iron' },
      { name: 'armor', desc: 'Craft and equip iron armor and tools' },
      { name: 'explore', desc: 'Explore and gather diverse resources' },
      { name: 'nether_prep', desc: 'Prepare materials for Nether (obsidian, flint & steel)' },
      { name: 'nether_blaze', desc: 'Enter Nether and collect blaze rods' },
      { name: 'ender_pearls', desc: 'Collect ender pearls' },
      { name: 'end_ready', desc: 'Assemble eyes and find stronghold / portal' }
    ];

    const perActionTimeout = 5 * 60 * 1000; // 5 minutes per action

    this.trainingPromise = (async () => {
      while (this.training && !this._trainingAbort) {
        try {
          // wait for a bot (no timeout) to allow respawn continuation
          while (!this.bot && !this._trainingAbort) await new Promise(r => setTimeout(r, 1000));
          if (!this.bot) break;

          // stage-driven behavior (prefer progression over random)
          const currentStage = stages[this.trainingStage] || stages[stages.length - 1];
          this.log('training_stage', { stage: currentStage.name });

          // perform a stage action with timeout and record success/failure
          let success = false;
          try {
            success = await this._withTimeout(this._performStageAction(currentStage.name), perActionTimeout);
          } catch (e) {
            this.session.errors.push({ error: String(e), time: Date.now() });
            success = false;
          }

          this.recordPattern(`train_stage:${currentStage.name}`, { success: !!success }, !!success);
          this.log('training_action', { stage: currentStage.name, success });
          // autosave after each stage attempt
          try { await this.autoSave(); } catch (e) {}

          // advance stage on success, otherwise try other remedial actions next loop
          if (success) {
            if (this.trainingStage < stages.length - 1) this.trainingStage++;
            else this.trainingStage = stages.length - 1; // stay at final stage
          } else {
            // if failing repeatedly, add small backoff
            await new Promise(r => setTimeout(r, 2000));
          }

          // short pause before next iteration to keep loop responsive
          await new Promise(r => setTimeout(r, Math.max(200, loopIntervalMs)));
        } catch (err) {
          this.session.errors.push({ error: String(err), time: Date.now() });
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // when loop ends, persist a full session
      try { await this.saveEverything(); } catch (e) { /* ignore */ }
      this.training = false;
      this._trainingAbort = false;
    })();
  }

  stopTraining() {
    if (!this.training) return;
    this._trainingAbort = true;
    this.training = false;
    console.log('[BRAIN] ⏹ Training stopping for', this.botName);
    // wait for background loop to finish and then save
    if (this.trainingPromise) {
      this.trainingPromise.catch(()=>{});
    }
    // also trigger a save immediately
    this.saveEverything().catch(() => {});
  }

  // Event hooking (only a subset to avoid huge overhead)
  attachHandlers(bot) {
    if (!bot) return;
    this._attachedBot = bot;
    // store handlers so we can detach later
    this._handlers.spawn = () => {
      this.log('spawn', { position: bot.entity?.position, dimension: bot.game?.dimension });
      this.takeStateSnapshot();
    };
    this._handlers.death = () => {
      const deathData = this.analyzeDeathInDetail();
      this.session.combat.deaths.push(deathData);
      this.recordFailure('death', deathData);
      // ensure we save on death
      this.saveEverything().catch(()=>{});
    };
    this._handlers.chat = (username, message) => {
      this.session.players.chat.push({ username, message, time: Date.now() });
      this.analyzeChat(username, message);
    };
    this._handlers.playerJoined = (player) => {
      if (player?.username) this.session.players.seen.add(player.username);
      this.log('player_joined', { username: player?.username });
    };
    this._handlers.playerLeft = (player) => {
      this.log('player_left', { username: player?.username });
    };
    this._handlers.error = (err) => {
      this.session.errors.push({ error: err?.message || String(err), stack: err?.stack, time: Date.now(), context: this.getCurrentState() });
    };
    this._handlers.end = async () => {
      // mark bot detached so training waits for respawn
      this.bot = null;
      await this.saveEverything().catch(()=>{});
    };

    bot.on('spawn', this._handlers.spawn);
    bot.on('death', this._handlers.death);
    bot.on('chat', this._handlers.chat);
    bot.on('playerJoined', this._handlers.playerJoined);
    bot.on('playerLeft', this._handlers.playerLeft);
    bot.on('error', this._handlers.error);
    bot.on('end', this._handlers.end);
  }

  detachHandlers() {
    if (!this._attachedBot) return;
    const b = this._attachedBot;
    if (this._handlers.spawn) b.off('spawn', this._handlers.spawn);
    if (this._handlers.death) b.off('death', this._handlers.death);
    if (this._handlers.chat) b.off('chat', this._handlers.chat);
    if (this._handlers.playerJoined) b.off('playerJoined', this._handlers.playerJoined);
    if (this._handlers.playerLeft) b.off('playerLeft', this._handlers.playerLeft);
    if (this._handlers.error) b.off('error', this._handlers.error);
    if (this._handlers.end) b.off('end', this._handlers.end);
    this._handlers = {};
    this._attachedBot = null;
  }

  startMonitoring() {
    this.snapshotInterval = setInterval(() => this.takeStateSnapshot(), 60000);
    this.positionInterval = setInterval(() => {
      if (this.bot && this.bot.entity) {
        this.session.environment.position.push({ x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z, time: Date.now() });
      }
    }, 10000);
    this.autosaveInterval = setInterval(async () => await this.autoSave(), 300000);
  }

  takeStateSnapshot() {
    if (!this.bot || !this.bot.entity) return;
    const snapshot = { time: Date.now(), health: this.bot.health, food: this.bot.food, position: { ...this.bot.entity.position }, dimension: this.bot.game?.dimension, inventory: this.bot.inventory.items().map(i => ({ name: i.name, count: i.count })) };
    this.session.stateSnapshots.push(snapshot);
  }

  analyzeDeathInDetail() {
    const recentDamage = this.session.combat.damageReceived.slice(-10);
    const recentActions = this.session.actions.slice(-30);
    const lastSnapshot = this.session.stateSnapshots[this.session.stateSnapshots.length - 1];
    let likelyReason = 'unknown';
    let prevention = 'Stay more alert';
    if (recentDamage.length > 0) {
      const lastAttacker = recentDamage[recentDamage.length - 1].attacker;
      if (lastAttacker) {
        likelyReason = `killed by ${lastAttacker}`;
        prevention = `Improve combat against ${lastAttacker}.`;
      }
    }
    if (lastSnapshot) {
      if (lastSnapshot.position?.y < 10) {
        likelyReason = 'fell into void or lava';
        prevention = 'Be careful near edges.';
      }
    }
    return { time: Date.now(), likelyReason, prevention, recentDamage, recentActions, lastState: lastSnapshot };
  }

  analyzeChat(username, message) {
    if (!message) return;
    if (message.toLowerCase().includes('tp') || message.toLowerCase().includes('teleport')) this.recordPattern('teleport_offer', { from: username }, true);
    if (message.toLowerCase().includes('trade')) this.recordPattern('trade_opportunity', { from: username }, true);
  }

  recordPattern(patternName, context, success) {
    const category = success ? 'successful' : 'failed';
    if (!this.patterns[category][patternName]) this.patterns[category][patternName] = { count: 0, contexts: [], lastSeen: null };
    this.patterns[category][patternName].count++;
    this.patterns[category][patternName].lastSeen = Date.now();
    this.patterns[category][patternName].contexts.push(context);
    if (this.patterns[category][patternName].contexts.length > 100) this.patterns[category][patternName].contexts.shift();
    this.updateNeuralNetwork(patternName, success ? 1 : -0.5);
  }

  updateNeuralNetwork(action, reward) {
    if (!this.brain.weights[action]) {
      this.brain.weights[action] = Math.random() * 0.2 + 0.4;
      this.brain.previousGradients[action] = 0;
    }
    const gradient = this.brain.learningRate * reward;
    const momentumTerm = this.brain.momentum * this.brain.previousGradients[action];
    this.brain.weights[action] += gradient + momentumTerm;
    this.brain.weights[action] = Math.max(0, Math.min(1, this.brain.weights[action]));
    this.brain.previousGradients[action] = gradient;
  }

  getActionConfidence(action) { return this.brain.weights[action] || 0.5; }

  getCurrentState() {
    if (!this.bot || !this.bot.entity) return {};
    return { health: this.bot.health, food: this.bot.food, position: this.bot.entity.position, dimension: this.bot.game?.dimension, time: this.bot.time?.timeOfDay };
  }

  _withTimeout(promiseOrFunc, ms) {
    const p = (typeof promiseOrFunc === 'function') ? promiseOrFunc() : promiseOrFunc;
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('action timeout'));
      }, ms);
      p.then((v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); }).catch((e) => { if (done) return; done = true; clearTimeout(timer); reject(e); });
    });
  }

  _countItem(substr) {
    if (!this.bot || !this.bot.inventory) return 0;
    const items = this.bot.inventory.items();
    return items.reduce((sum, it) => (it.name && it.name.includes(substr) ? sum + it.count : sum), 0);
  }

  async _performStageAction(stageName) {
    // uses skills.* utilities to attempt meaningful progress for each stage
    if (!this.bot) return false;
    switch (stageName) {
      case 'sustain': {
        // ensure food >= 16 or food level high
        const cooked = this._countItem('cooked_');
        if (this.bot.food >= 16 || cooked >= 8) return true;
        // try attacking nearby passive animals
        try {
          const hunted = await skills.attackNearest(this.bot, 'cow', true).catch(()=>false);
          if (hunted) return true;
        } catch (e) {}
        // try fishing
        try {
          const water = await skills.goToNearestBlock(this.bot, 'water', 4, 128).catch(()=>false);
          if (water) {
            for (let i=0;i<6 && !this.bot.interrupt_code;i++) {
              await skills.wait(this.bot, 3000).catch(()=>{});
              await skills.pickupNearbyItems(this.bot).catch(()=>{});
            }
            if (this._countItem('cooked_') > cooked || this.bot.food >= 12) return true;
          }
        } catch (e) {}
        return false;
      }
      case 'wood_stone': {
        const wood = this._countItem('log') + this._countItem('wood');
        const stone = this._countItem('cobblestone') + this._countItem('stone');
        if (wood >= 32 && stone >= 32) return true;
        try {
          if (wood < 32) await skills.collectBlock(this.bot, 'oak_log', Math.max(8, 32 - wood)).catch(()=>{});
          if (stone < 32) await skills.collectBlock(this.bot, 'stone', Math.max(8, 32 - stone)).catch(()=>{});
          return (this._countItem('log') + this._countItem('wood') >= 32) && (this._countItem('cobblestone') + this._countItem('stone') >= 32);
        } catch (e) { return false; }
      }
      case 'tools': {
        // craft basic stone tools if possible
        try {
          const inv = this.bot.inventory.items();
          const hasPick = inv.some(i=>i.name && (i.name.includes('stone_pickaxe')||i.name.includes('wooden_pickaxe')||i.name.includes('iron_pickaxe')));
          if (hasPick) return true;
          const crafted = await skills.craftRecipe(this.bot, 'stone_pickaxe', 1).catch(()=>false);
          if (crafted) return true;
          // fallback: craft wooden tools
          const crafted2 = await skills.craftRecipe(this.bot, 'wooden_pickaxe', 1).catch(()=>false);
          return !!crafted2;
        } catch (e) { return false; }
      }
      case 'iron': {
        // attempt to collect raw_iron and smelt
        try {
          const ingots = this._countItem('iron_ingot');
          if (ingots >= 8) return true;
          // collect nearby iron ore
          await skills.collectBlock(this.bot, 'iron_ore', 8).catch(()=>{});
          // smelt raw_iron if present
          const rawCount = this._countItem('raw_iron');
          if (rawCount > 0) {
            await skills.smeltItem(this.bot, 'raw_iron', Math.min(8, rawCount)).catch(()=>{});
          }
          return this._countItem('iron_ingot') >= 8;
        } catch (e) { return false; }
      }
      case 'armor': {
        try {
          // try to craft simple armor pieces if enough ingots
          if (this._countItem('iron_ingot') >= 8) {
            await skills.craftRecipe(this.bot, 'iron_chestplate', 1).catch(()=>{});
            await skills.craftRecipe(this.bot, 'iron_leggings', 1).catch(()=>{});
            this.bot.armorManager.equipAll();
            return true;
          }
          return false;
        } catch (e) { return false; }
      }
      case 'explore': {
        try {
          await skills.moveAway(this.bot, 12).catch(()=>{});
          await skills.pickupNearbyItems(this.bot).catch(()=>{});
          return true;
        } catch (e) { return false; }
      }
      case 'nether_prep': {
        try {
          // Ensure flint & steel or equivalent for portal lighting
          const hasFAS = this._countItem('flint_and_steel') > 0;
          if (!hasFAS) {
            // try to get flint by collecting gravel and crafting
            await skills.collectBlock(this.bot, 'gravel', 12).catch(()=>{});
            await skills.craftRecipe(this.bot, 'flint_and_steel', 1).catch(()=>{});
          }
          // try to collect obsidian nearby if present
          const obsidian = this._countItem('obsidian');
          if (obsidian >= 10 && (hasFAS || this._countItem('flint_and_steel') > 0)) return true;
          // if portal exists locally, prefer that
          const portalBlock = await (async () => {
            try { return await Promise.resolve(null); } catch(e) { return null; }
          })();
          // best-effort: search and mine obsidian (may fail without diamond pickaxe)
          if (obsidian < 10) {
            await skills.moveAway(this.bot, 12).catch(()=>{});
            await skills.collectBlock(this.bot, 'obsidian', 6).catch(()=>{});
          }
          return this._countItem('obsidian') >= 10 || this._countItem('flint_and_steel') > 0;
        } catch (e) { return false; }
      }
      case 'nether_blaze': {
        try {
          // Attempt to find or construct a portal, enter Nether, and collect blaze rods
          // 1) Try to locate a portal nearby
          await skills.moveAway(this.bot, 10).catch(()=>{});
          // 2) If portal not found, try to build/prepare one (best-effort)
          // Building a portal is complex; try to locate obsidian and flint_and_steel then place
          const obsidianCount = this._countItem('obsidian');
          const hasFAS = this._countItem('flint_and_steel') > 0;
          if (obsidianCount >= 10 && hasFAS) {
            // try to build a simple portal area and light it
            // best-effort: place obsidian in a circle if possible
            try { await skills.placeBlock(this.bot, 'obsidian', Math.floor(this.bot.entity.position.x)+1, Math.floor(this.bot.entity.position.y), Math.floor(this.bot.entity.position.z)).catch(()=>{}); } catch(e) {}
          }
          // Try to enter nearby portal by moving/pushing through
          try { await skills.moveAway(this.bot, 6).catch(()=>{}); } catch (e) {}
          // Once in Nether (dimension check), attack blazes
          if (this.bot.game?.dimension === 'nether' || this.bot.game?.dimension === -1) {
            // hunt blazes repeatedly
            let collected = 0;
            for (let i=0;i<8 && !this.bot.interrupt_code;i++) {
              const killed = await skills.attackNearest(this.bot, 'blaze', true).catch(()=>false);
              if (killed) {
                await skills.pickupNearbyItems(this.bot).catch(()=>{});
                collected += this._countItem('blaze_rod');
                if (collected >= 4) break;
              } else {
                await skills.moveAway(this.bot, 12).catch(()=>{});
              }
            }
            return this._countItem('blaze_rod') >= 4;
          }
          // if not in Nether, return false to trigger retries
          return false;
        } catch (e) { return false; }
      }
      case 'ender_pearls': {
        try {
          // hunt endermen; prefer night or darker areas
          let pearls = this._countItem('ender_pearl');
          if (pearls >= 12) return true;
          // move to open area and attempt to find endermen
          await skills.moveAway(this.bot, 16).catch(()=>{});
          for (let i=0;i<6 && !this.bot.interrupt_code;i++) {
            const hunted = await skills.attackNearest(this.bot, 'enderman', true).catch(()=>false);
            if (hunted) {
              await skills.pickupNearbyItems(this.bot).catch(()=>{});
              pearls = this._countItem('ender_pearl');
              if (pearls >= 12) return true;
            } else {
              await skills.moveAway(this.bot, 12).catch(()=>{});
            }
          }
          return this._countItem('ender_pearl') >= 12;
        } catch (e) { return false; }
      }
      case 'end_ready': {
        try {
          // assemble eyes if possible using blaze rods -> blaze powder and ender pearls
          const pearls = this._countItem('ender_pearl');
          const blaze = this._countItem('blaze_rod');
          if (pearls >= 12 && blaze >= 4) return true;
          // try to craft blaze powder from rods if possible
          if (blaze > 0) await skills.craftRecipe(this.bot, 'blaze_powder', blaze).catch(()=>{});
          // try to craft eyes from pearls + blaze powder
          const possibleEyes = Math.min(Math.floor(this._countItem('blaze_powder') || 0), this._countItem('ender_pearl'));
          if (possibleEyes > 0) await skills.craftRecipe(this.bot, 'eye_of_ender', possibleEyes).catch(()=>{});
          return this._countItem('eye_of_ender') >= 12;
        } catch (e) { return false; }
      }
      case 'nether_blaze': {
        // best-effort: enter nether is complex; attempt to wander and look for nether-like portals
        try {
          await skills.moveAway(this.bot, 20).catch(()=>{});
          return true;
        } catch (e) { return false; }
      }
      case 'ender_pearls': {
        try {
          // attempt to hunt endermen at night or explore
          const hunted = await skills.attackNearest(this.bot, 'enderman', true).catch(()=>false);
          if (hunted) return true;
          await skills.moveAway(this.bot, 16).catch(()=>{});
          return false;
        } catch (e) { return false; }
      }
      case 'end_ready': {
        try {
          // Try to combine progress: collect eyes from pearls and blaze rods (best-effort)
          const pearls = this._countItem('ender_pearl');
          const blaze = this._countItem('blaze_rod');
          if (pearls >= 12 && blaze >= 4) return true;
          // otherwise attempt exploration/hunt
          await skills.moveAway(this.bot, 20).catch(()=>{});
          return false;
        } catch (e) { return false; }
      }
    }
    return false;
  }

  log(eventType, data) { this.session.actions.push({ type: eventType, data, time: Date.now() }); }
  recordFailure(type, data) { this.session.failures.push({ type, data, time: Date.now(), context: this.getCurrentState() }); }

  updateMetric(category, metric, value) {
    if (this.session.performance[category]) {
      this.session.performance[category][metric] += value;
      this.recalculateScore(category);
    }
  }

  recalculateScore(category) { const perf = this.session.performance[category]; let score = 0; switch(category) { case 'pvp': score = (perf.wins * 50) - (perf.losses * 30) + (perf.accuracy * 20); break; case 'mining': score = (perf.blocks * 1) + (perf.ores * 10) - (perf.deaths * 50); break; case 'survival': score = (perf.time / 1000) - (perf.deaths * 100); break; default: score = Object.values(perf).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0); } perf.score = score; }

  async saveEverything() {
    try {
      this.session.endTime = Date.now();
      const sessionDuration = this.session.endTime - this.session.startTime;
      const fitness = this.calculateFitness();
      const saveData = { id: this.session.id, timestamp: Date.now(), duration: sessionDuration, fitness, session: this.serializeSession(), brain: { weights: this.brain.weights, biases: this.brain.biases }, patterns: this.patterns, metrics: this.metrics, predictions: this.predictions, summary: this.generateSessionSummary() };
      const filename = `session_${this.session.id}_fitness_${Math.floor(fitness)}_${Date.now()}.json`;
      const filepath = path.join(this.sessionsDir, filename);
      await fs.writeFile(filepath, JSON.stringify(saveData, null, 2));
      await this.intelligentCleanup();
      await this.generateMasterBrain();
      return saveData;
    } catch (err) { console.error('[BRAIN] ❌ Error saving:', err); }
  }

  serializeSession() {
    return {
      ...this.session,
      world: { chunks: Array.from(this.session.world.chunks), biomes: Array.from(this.session.world.biomes), structures: this.session.world.structures, discovered: this.session.world.discovered },
      players: { seen: Array.from(this.session.players.seen), interactions: this.session.players.interactions, chat: this.session.players.chat, trades: this.session.players.trades },
      entities: { seen: Array.from(this.session.entities.seen), interactions: this.session.entities.interactions, spawns: this.session.entities.spawns, despawns: this.session.entities.despawns }
    };
  }

  calculateFitness() {
    let fitness = 0;
    const survivalMinutes = (Date.now() - this.session.startTime) / 60000;
    fitness += survivalMinutes * 10;
    for (const category in this.session.performance) if (category !== 'overall') fitness += this.session.performance[category].score;
    fitness += this.session.actions.length * 0.1;
    fitness += this.session.world.chunks.size * 2;
    fitness += this.session.world.biomes.size * 10;
    fitness += this.session.blocks.broken.length * 0.5;
    fitness += this.session.inventory.pickups.length * 1;
    fitness += this.session.combat.kills.length * 20;
    fitness -= this.session.combat.deaths.length * 100;
    fitness -= this.session.errors.length * 5;
    fitness -= this.session.failures.length * 10;
    return Math.max(0, fitness);
  }

  generateSessionSummary() { return { duration: Date.now() - this.session.startTime, totalActions: this.session.actions.length, blocksBroken: this.session.blocks.broken.length, blocksPlaced: this.session.blocks.placed.length, itemsCollected: this.session.inventory.pickups.length, kills: this.session.combat.kills.length, deaths: this.session.combat.deaths.length, chunksExplored: this.session.world.chunks.size, biomesDiscovered: this.session.world.biomes.size, playersEncountered: this.session.players.seen.size, errorsEncountered: this.session.errors.length, topPerformingCategory: this.getTopCategory(), weakestCategory: this.getWeakestCategory() } }

  getTopCategory() { let best = null; let maxScore = -Infinity; for (const [cat, perf] of Object.entries(this.session.performance)) { if (cat !== 'overall' && perf.score > maxScore) { maxScore = perf.score; best = cat; }} return { category: best, score: maxScore }; }
  getWeakestCategory() { let worst = null; let minScore = Infinity; for (const [cat, perf] of Object.entries(this.session.performance)) { if (cat !== 'overall' && perf.score < minScore) { minScore = perf.score; worst = cat; }} return { category: worst, score: minScore }; }

  async autoSave() { try { const tempData = { timestamp: Date.now(), session: this.serializeSession(), brain: { weights: this.brain.weights } }; const filepath = path.join(this.sessionsDir, `autosave_${this.session.id}.json`); await fs.writeFile(filepath, JSON.stringify(tempData, null, 2)); } catch (err) { console.error('[BRAIN] ❌ AutoSave error', err); } }

  async loadAllKnowledge() { try {
      const files = await fs.readdir(this.sessionsDir).catch(()=>[]);
      // if a MASTER_BRAIN.json exists, load its weights as initial knowledge
      try {
        const masterPath = path.join(this.dataDir, `MASTER_BRAIN_${this.botName}.json`);
        const mstat = await fs.stat(masterPath).catch(()=>null);
        if (mstat) {
          const masterRaw = await fs.readFile(masterPath, 'utf8');
          const master = JSON.parse(masterRaw);
          if (master && master.neuralNetwork && master.neuralNetwork.weights) {
            this.brain.weights = Object.assign({}, this.brain.weights, master.neuralNetwork.weights);
            console.log('[BRAIN] Loaded MASTER_BRAIN weights.');
          }
        }
      } catch (e) { console.warn('[BRAIN] MASTER_BRAIN load failed:', e && e.message); }
      const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));
      if (sessionFiles.length === 0) {
        console.log('[BRAIN] 📚 No previous knowledge found. Starting fresh!');
        return;
      }
      const sessions = [];
      for (const file of sessionFiles) {
        try { const data = await fs.readFile(path.join(this.sessionsDir, file), 'utf8'); sessions.push(JSON.parse(data)); } catch (err) { console.error(`[BRAIN] ⚠️  Could not load ${file}`); }
      }
      await this.mergeKnowledge(sessions);
    } catch (err) { console.error('[BRAIN] ❌ Error loading knowledge:', err); } }

  async mergeKnowledge(sessions) {
    sessions.sort((a, b) => b.fitness - a.fitness);
    const bestSessions = sessions.slice(0, this.maxSaves);
    const totalFitness = bestSessions.reduce((sum, s) => sum + s.fitness, 0) || 1;
    for (const session of bestSessions) {
      const weight = session.fitness / totalFitness;
      for (const [key, value] of Object.entries(session.brain?.weights || {})) {
        if (!this.brain.weights[key]) this.brain.weights[key] = value * weight; else this.brain.weights[key] = this.brain.weights[key] * 0.3 + value * weight * 0.7;
      }
      for (const [type, patterns] of Object.entries(session.patterns || {})) {
        if (!this.patterns[type]) this.patterns[type] = {};
        for (const [name, data] of Object.entries(patterns)) {
          if (!this.patterns[type][name]) this.patterns[type][name] = { ...data };
          else { this.patterns[type][name].count += data.count; this.patterns[type][name].contexts.push(...data.contexts.slice(-10)); }
        }
      }
      if (session.predictions) {
        this.predictions.dangerZones.push(...(session.predictions.dangerZones || []));
        this.predictions.safeZones.push(...(session.predictions.safeZones || []));
        for (const [resource, locations] of Object.entries(session.predictions.resourceLocations || {})) {
          if (!this.predictions.resourceLocations[resource]) this.predictions.resourceLocations[resource] = [];
          this.predictions.resourceLocations[resource].push(...locations);
        }
      }
    }
    for (const key in this.brain.weights) this.brain.weights[key] = Math.max(0, Math.min(1, this.brain.weights[key]));
    this.predictions.dangerZones = this.predictions.dangerZones.slice(-100);
    this.predictions.safeZones = this.predictions.safeZones.slice(-100);
  }

  async intelligentCleanup() {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const sessionFiles = files.filter(f => f.startsWith('session_') && f.endsWith('.json'));
      // First, merge autosaves into proper session files where possible
      const autosaves = files.filter(f => f.startsWith('autosave_'));
      for (const file of autosaves) {
        try {
          const full = path.join(this.sessionsDir, file);
          const raw = await fs.readFile(full, 'utf8');
          const parsed = JSON.parse(raw);
          const sid = (parsed && parsed.session && parsed.session.id) ? parsed.session.id : (file.replace('autosave_', '').replace('.json',''));
          // Find existing session files for this session id
          const matching = sessionFiles.filter(s => s.startsWith(`session_${sid}_`));
          if (matching.length > 0) {
            // pick the best (highest fitness) session file
            let best = null;
            let bestFitness = -Infinity;
            for (const m of matching) {
              const mm = m.match(/fitness_(\d+)/);
              const f = mm ? parseInt(mm[1]) : 0;
              if (f > bestFitness) { bestFitness = f; best = m; }
            }
            if (best) {
              const bestPath = path.join(this.sessionsDir, best);
              try {
                const bestRaw = await fs.readFile(bestPath, 'utf8');
                const bestObj = JSON.parse(bestRaw);
                // Merge actions and snapshots (simple concatenation + dedupe by timestamp)
                const aActions = (bestObj.session && bestObj.session.actions) ? bestObj.session.actions : [];
                const bActions = (parsed.session && parsed.session.actions) ? parsed.session.actions : [];
                const mergedActions = [...aActions, ...bActions];
                mergedActions.sort((x,y) => (x.time||0) - (y.time||0));
                // dedupe by JSON string
                const seen = new Set();
                const deduped = [];
                for (const act of mergedActions) {
                  try {
                    const k = JSON.stringify(act);
                    if (!seen.has(k)) { seen.add(k); deduped.push(act); }
                  } catch(e) { deduped.push(act); }
                }
                bestObj.session = bestObj.session || {};
                bestObj.session.actions = deduped;
                // merge brain weights by averaging (simple approach)
                bestObj.brain = bestObj.brain || {};
                const aw = bestObj.brain.weights || {};
                const bw = (parsed.brain && parsed.brain.weights) ? parsed.brain.weights : {};
                for (const [k, v] of Object.entries(bw)) {
                  if (aw[k] == null) aw[k] = v; else aw[k] = (aw[k] + v) / 2;
                }
                bestObj.brain.weights = aw;
                // update fitness if autosave provided one
                bestObj.fitness = Math.max(bestObj.fitness || 0, parsed.fitness || 0);
                await fs.writeFile(bestPath, JSON.stringify(bestObj, null, 2));
              } catch (e) {
                // if reading/writing best failed, fallback to renaming autosave into a session file
                const newName = `session_${sid}_fitness_0_${Date.now()}.json`;
                await fs.writeFile(path.join(this.sessionsDir, newName), JSON.stringify({ id: sid, timestamp: Date.now(), fitness: parsed.fitness || 0, session: parsed.session || {}, brain: parsed.brain || {} }, null, 2));
              }
            }
          } else {
            // No matching session: convert autosave into a session file
            const newName = `session_${sid}_fitness_0_${Date.now()}.json`;
            await fs.writeFile(path.join(this.sessionsDir, newName), JSON.stringify({ id: sid, timestamp: Date.now(), fitness: parsed.fitness || 0, session: parsed.session || {}, brain: parsed.brain || {} }, null, 2));
          }
          // remove the autosave after processing
          await fs.unlink(full).catch(()=>{});
        } catch (e) {
          // if parsing failed, just remove the autosave to avoid clutter
          try { await fs.unlink(path.join(this.sessionsDir, file)); } catch (e2) {}
        }
      }

      // Recompute sessionFiles after merging autosaves
      const refreshed = await fs.readdir(this.sessionsDir);
      const refreshedSessionFiles = refreshed.filter(f => f.startsWith('session_') && f.endsWith('.json'));
      if (refreshedSessionFiles.length <= this.maxSaves) return;
      const fileData = [];
      for (const file of refreshedSessionFiles) {
        const match = file.match(/fitness_(\d+)/);
        if (match) fileData.push({ file, fitness: parseInt(match[1]), path: path.join(this.sessionsDir, file) });
      }
      fileData.sort((a, b) => b.fitness - a.fitness);
      const toDelete = fileData.slice(this.maxSaves);
      for (const { path: filepath } of toDelete) {
        try { await fs.unlink(filepath); } catch (e) {}
      }
    } catch (err) { console.error('[BRAIN] ⚠️  Cleanup error:', err); }
  }

  async generateMasterBrain() {
    try {
      const masterBrain = { version: '2.0', botName: this.botName, lastUpdated: Date.now(), totalSessions: this.session.performance.overall.sessions, neuralNetwork: { weights: this.brain.weights, biases: this.brain.biases, totalUpdates: Object.values(this.brain.weights).length }, patterns: { successful: this.getTopPatterns('successful', 50), failed: this.getTopPatterns('failed', 30), optimal: this.patterns.optimal }, predictions: this.predictions, bestPractices: this.generateBestPractices(), statistics: this.generateOverallStats() };
      const filepath = path.join(this.dataDir, `MASTER_BRAIN_${this.botName}.json`);
      await fs.writeFile(filepath, JSON.stringify(masterBrain, null, 2));
    } catch (err) { console.error('[BRAIN] ❌ Error generating master brain:', err); }
  }

  getTopPatterns(type, limit) { const patterns = this.patterns[type] || {}; const sorted = Object.entries(patterns).sort((a, b) => b[1].count - a[1].count).slice(0, limit); return Object.fromEntries(sorted); }
  generateBestPractices() { const practices = {}; for (const category in this.session.performance) { if (category === 'overall') continue; const successfulPatterns = Object.entries(this.patterns.successful || {}).filter(([name]) => name.includes(category)).sort((a, b) => b[1].count - a[1].count).slice(0, 5); practices[category] = { topStrategies: successfulPatterns.map(([name, data]) => ({ strategy: name, successRate: data.count, confidence: this.brain.weights[name] || 0.5 })), avoidances: this.getAvoidances(category) }; } return practices; }
  getAvoidances(category) { const failedPatterns = Object.entries(this.patterns.failed || {}).filter(([name]) => name.includes(category)).sort((a, b) => b[1].count - a[1].count).slice(0, 3); return failedPatterns.map(([name, data]) => ({ danger: name, occurrences: data.count, severity: 1 - (this.brain.weights[name] || 0.5) })); }
  generateOverallStats() { return { totalActions: this.session.actions.length, totalDeaths: this.session.combat.deaths.length, totalKills: this.session.combat.kills.length, explorationProgress: { chunks: this.session.world.chunks.size, biomes: this.session.world.biomes.size }, resourceEfficiency: { blocksMinedPerMinute: this.session.blocks.broken.length / ((Date.now() - this.session.startTime) / 60000), itemsCollectedPerMinute: this.session.inventory.pickups.length / ((Date.now() - this.session.startTime) / 60000) } }; }
  destroy() { if (this.snapshotInterval) clearInterval(this.snapshotInterval); if (this.positionInterval) clearInterval(this.positionInterval); if (this.autosaveInterval) clearInterval(this.autosaveInterval); }
}

export class SmartBot {
  constructor(options) {
    this.options = options;
    this.brain = new UltimateBotBrain(options.username || 'SmartBot');
    this.bot = null;
  }

  async start() {
    this.bot = mineflayer.createBot(this.options);
    await this.brain.initialize(this.bot);
    this.bot.on('spawn', () => { /* can hook custom behaviors here */ });
    return this.bot;
  }

  async stop() { if (this.bot) this.bot.end(); this.brain.destroy(); }
  async doAction(actionName, category, actionFunction) { const decision = this.brain.shouldPerformAction(actionName, category); try { const result = await actionFunction(); this.brain.recordPattern(actionName, { result }, true); return result; } catch (err) { this.brain.recordPattern(actionName, { error: err.message }, false); throw err; } }
  getBot() { return this.bot; }
  getBrain() { return this.brain; }
}
