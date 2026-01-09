#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { argv } from 'process';

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const botName = args.bot || args.b || null;
  const dataDirRoot = path.join(process.cwd(), 'data', 'bot_brain');
  let botNames = [];
  if (args.all) {
    // evolve for all bot directories
    const dirs = await fs.readdir(dataDirRoot).catch(()=>[]);
    botNames = dirs.filter(d => d && d !== '.' && d !== '..');
  } else if (botName) {
    botNames = [botName];
  } else {
    botNames = ['Bot'];
  }
  // helper: perform merge of sessions and master brains for a bot
  async function mergeForBot(bn) {
    const dataDir = path.join(dataDirRoot, bn);
    const sessionsDir = path.join(dataDir, 'sessions');
    await fs.mkdir(sessionsDir, { recursive: true }).catch(()=>{});
    const files = await fs.readdir(sessionsDir).catch(()=>[]);
    const pool = {};
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      let raw;
      try { raw = await fs.readFile(path.join(sessionsDir, f), 'utf8'); } catch(e){ continue; }
      let obj;
      try { obj = JSON.parse(raw); } catch(e){ continue; }
      const sid = (obj && obj.id) || (obj.session && obj.session.id) || f.replace(/^session_/, '').replace(/^autosave_/, '').replace(/\.json$/, '');
      pool[sid] = pool[sid] || [];
      pool[sid].push({ file: f, data: obj });
    }
    // write merged files
    for (const [sid, items] of Object.entries(pool)) {
      try {
        let fitness = 0; let latest = 0; let merged = { session: { actions: [], stateSnapshots: [] }, brain: { weights: {} } };
        for (const it of items) {
          const d = it.data;
          if (d.fitness && d.fitness > fitness) fitness = d.fitness;
          if (d.timestamp && d.timestamp > latest) latest = d.timestamp;
          const acts = (d.session && d.session.actions) ? d.session.actions : [];
          merged.session.actions.push(...acts);
          const snaps = (d.session && d.session.stateSnapshots) ? d.session.stateSnapshots : [];
          merged.session.stateSnapshots.push(...snaps);
          const bw = (d.brain && d.brain.weights) ? d.brain.weights : {};
          for (const [k,v] of Object.entries(bw)) {
            if (!merged.brain.weights[k]) merged.brain.weights[k] = { sum: 0, count: 0 };
            merged.brain.weights[k].sum += v; merged.brain.weights[k].count += 1;
          }
        }
        const finalWeights = {};
        for (const [k, s] of Object.entries(merged.brain.weights)) finalWeights[k] = s.sum / s.count;
        merged.brain.weights = finalWeights;
        const seen = new Set();
        const deduped = [];
        merged.session.actions.sort((a,b) => (a.time||0) - (b.time||0));
        for (const a of merged.session.actions) {
          try { const k = JSON.stringify(a); if (!seen.has(k)) { seen.add(k); deduped.push(a); } } catch(e){ deduped.push(a); }
        }
        merged.session.actions = deduped;
        const outName = `session_${sid}_fitness_${Math.floor(fitness)}_${Date.now()}.json`;
        await fs.writeFile(path.join(sessionsDir, outName), JSON.stringify({ id: sid, timestamp: latest || Date.now(), fitness, session: merged.session, brain: { weights: merged.brain.weights } }, null, 2));
        for (const it of items) {
          try { await fs.unlink(path.join(sessionsDir, it.file)); } catch(e){}
        }
      } catch (e) { console.warn('merge failed for', sid, e && e.message); }
    }

    // merge MASTER_BRAIN files if present
    try {
      const masterFiles = (await fs.readdir(dataDir)).filter(f => f.startsWith('MASTER_BRAIN') && f.endsWith('.json'));
      if (masterFiles.length > 1) {
        const masters = [];
        for (const mf of masterFiles) {
          try { masters.push(JSON.parse(await fs.readFile(path.join(dataDir, mf), 'utf8'))); } catch(e){}
        }
        const agg = {};
        const counts = {};
        for (const m of masters) {
          const w = (m && m.neuralNetwork && m.neuralNetwork.weights) ? m.neuralNetwork.weights : {};
          for (const [k,v] of Object.entries(w)) { agg[k] = (agg[k]||0) + v; counts[k] = (counts[k]||0) + 1; }
        }
        const final = {};
        for (const [k,v] of Object.entries(agg)) final[k] = v / (counts[k] || 1);
        const out = { version: 'merged', botName: bn, timestamp: Date.now(), neuralNetwork: { weights: final } };
        await fs.writeFile(path.join(dataDir, `MASTER_BRAIN_${bn}.json`), JSON.stringify(out, null, 2));
        console.log('Merged MASTER_BRAIN files for', bn);
      }
    } catch(e) { /* ignore */ }
  }

  async function evolveOnce() {
    for (const bn of botNames) {
      const dataDir = path.join(dataDirRoot, bn);
      const sessionsDir = path.join(dataDir, 'sessions');
      try {
        if (args.merge) {
          await mergeForBot(bn);
          continue;
        }
        await fs.mkdir(sessionsDir, { recursive: true });
        const files = await fs.readdir(sessionsDir);
        const sessions = [];
        for (const f of files) {
          if (!f.startsWith('session_') || !f.endsWith('.json')) continue;
          try { const raw = await fs.readFile(path.join(sessionsDir, f), 'utf8'); sessions.push(JSON.parse(raw)); } catch (e) { console.warn('Failed parse', f, e && e.message); }
        }
        if (sessions.length === 0) {
          console.log('No session files to evolve for', bn);
          continue;
        }
        sessions.sort((a,b) => (b.fitness||0) - (a.fitness||0));
        const top = sessions.slice(0, Math.min(10, sessions.length));
        const totalFitness = top.reduce((s,x)=>s+(x.fitness||1), 0) || 1;
        const agg = {};
        for (const sFile of top) {
          const w = sFile.brain && sFile.brain.weights ? sFile.brain.weights : {};
          const weight = (sFile.fitness || 1) / totalFitness;
          for (const [k,v] of Object.entries(w)) {
            agg[k] = (agg[k] || 0) + v * weight;
          }
        }
        const master = { version: 'evolved-1', botName: bn, timestamp: Date.now(), neuralNetwork: { weights: agg } };
        const outPath = path.join(dataDir, `MASTER_BRAIN_evolved_${Date.now()}.json`);
        await fs.writeFile(outPath, JSON.stringify(master, null, 2));
        await fs.writeFile(path.join(dataDir, `MASTER_BRAIN_${bn}.json`), JSON.stringify(master, null, 2));
        console.log('Evolved MASTER_BRAIN written to', outPath);
      } catch (err) {
        console.error('Evolver failed for', bn, ':', err && err.message ? err.message : err);
      }
    }
  }

  // If daemon/auto flag specified, run continuously at given interval
  const intervalMs = (parseInt(args.interval || args.i || 10) || 10) * 60 * 1000;
  if (args.daemon || args.auto || args.forever) {
    console.log('Starting neuroevolve in daemon mode for', botNames, 'intervalMs=', intervalMs);
    await evolveOnce();
    setInterval(async () => { try { await evolveOnce(); } catch(e){ console.error('Daemon evolve error', e); } }, intervalMs);
    return;
  }

  // single run
  await evolveOnce();
}

main();
main();
