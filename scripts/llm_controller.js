#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fetch from 'node-fetch';
import fs from 'fs';

const argv = yargs(hideBin(process.argv))
  .option('agent', { type: 'string', demandOption: true, describe: 'Agent name to control (bot profile name)' })
  .option('text', { type: 'string', describe: 'Plain text command (e.g., "say hello", "/help", "dig stone")' })
  .option('server', { type: 'string', default: 'http://localhost:8080', describe: 'MindServer URL' })
  .option('use-llm', { type: 'boolean', default: false, describe: 'Use LLM to translate natural language to structured command' })
  .option('llm', { type: 'string', describe: 'LLM provider: openai' })
  .argv;

async function callOpenAITranslate(text) {
  // Try env var first
  const key = process.env.OPENAI_API_KEY || (() => { try { const k = JSON.parse(fs.readFileSync('./keys.json','utf8')).OPENAI_API_KEY; return k; } catch(e){ return null; } })();
  if (!key) throw new Error('No OpenAI key provided in OPENAI_API_KEY or keys.json');

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = `Translate the following user instruction into a JSON object with fields: actionName (string or null), args (array). Return ONLY a valid JSON object and no additional text. If the command is not an action, set actionName to null and include the raw_text field with the original message. Examples:\n\nInstruction: "!mine stone 32" -> {"actionName":"mine","args":["stone",32]}\nInstruction: "Say hello" -> {"actionName":null,"raw_text":"Say hello"}\n\nInstruction: "${text}"`;

  const body = {
    model,
    messages: [{ role: 'system', content: 'You are a translator that maps natural language to a concise JSON action description.' }, { role: 'user', content: prompt }],
    temperature: 0
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('OpenAI error: ' + txt);
  }

  const data = await resp.json();
  let content = data.choices?.[0]?.message?.content || '';
  // Extract JSON from response
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not extract JSON from LLM response: ' + content);
  const jsonText = match[0];
  const parsed = JSON.parse(jsonText);
  // validate shape: { actionName: string|null, args: array, raw_text?: string }
  if (parsed.actionName !== null && parsed.actionName !== undefined && typeof parsed.actionName !== 'string') {
    throw new Error('Invalid actionName in LLM response');
  }
  if (parsed.args !== undefined && !Array.isArray(parsed.args)) {
    throw new Error('Invalid args in LLM response; expected array');
  }
  return parsed;
}

async function interpretToCommand(text) {
  text = (text || '').trim();
  if (!text) return null;

  if (argv['use-llm'] && (argv.llm === 'openai' || argv.llm === undefined)) {
    try {
      const translated = await callOpenAITranslate(text);
      if (!translated) return null;
      if (translated.actionName) {
        return { type: 'action', actionName: translated.actionName, args: translated.args || [] };
      }
      if (translated.raw_text) {
        text = translated.raw_text;
      }
    } catch (err) {
      console.warn('LLM translation failed, falling back to heuristic parser:', err && err.message ? err.message : err);
    }
  }

  // If user sends an 'action' style command starting with !, parse it into action payload
  if (text.startsWith('!')) {
    // e.g. !mine stone 32  => actionName: 'mine', args: ['stone','32']
    const parts = text.slice(1).split(' ').filter(p => p !== '');
    const name = parts[0];
    const args = parts.slice(1).map(p => {
      // coerce numbers
      if (!isNaN(Number(p))) return Number(p);
      // strip quotes
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) return p.slice(1,-1);
      return p;
    });
    return { type: 'action', actionName: name, args };
  }

  // Very small heuristic parser; you can replace this with an LLM's output mapping
  if (text.startsWith('/')) {
    return { type: 'raw', text };
  }

  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');

  if (cmd === 'say' || cmd === 'chat') return { type: 'chat', text: rest || '' };
  if (cmd === 'respawn') return { type: 'respawn' };
  if (cmd === 'swing') return { type: 'swing' };
  if (cmd === 'dig') return { type: 'dig', blockType: rest || null };

  // default to chat
  return { type: 'chat', text };
}

async function main() {
  const agent = argv.agent;
  let text = argv.text;

  if (!text) {
    // Read one line from stdin
    process.stdin.setEncoding('utf8');
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = chunks.join('').trim();
  }

  const command = await interpretToCommand(text);
  if (!command) {
    console.error('No command to send');
    process.exit(2);
  }

  try {
    const res = await fetch(`${argv.server}/api/agents/${encodeURIComponent(agent)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    const data = await res.json();
    console.log('Server response:', data);
  } catch (err) {
    console.error('Failed to send command:', err);
    process.exit(1);
  }
}

main();
