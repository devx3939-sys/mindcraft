import * as skills from '../library/skills.js';
import settings from '../settings.js';


function runAsAction (actionFn, resume = false, timeout = -1) {
    let actionLabel = null;  // Will be set on first use
    
    const wrappedAction = async function (agent, ...args) {
        // Set actionLabel only once, when the action is first created
        if (!actionLabel) {
            const actionObj = actionsList.find(a => a.perform === wrappedAction);
            actionLabel = actionObj.name.substring(1); // Remove the ! prefix
        }

        const actionFnWithAgent = async () => {
            await actionFn(agent, ...args);
        };
        const code_return = await agent.actions.runAction(`action:${actionLabel}`, actionFnWithAgent, { timeout, resume });
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }

    return wrappedAction;
}

export const actionsList = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command.', 
        params: {
            'prompt': { type: 'string', description: 'A natural language prompt to guide code generation. Make a detailed step-by-step plan.' }
        },
        perform: async function(agent, prompt) {
            // just ignore prompt - it is now in context in chat history
            if (!settings.allow_insecure_coding) { 
                agent.openChat('newAction is disabled. Enable with allow_insecure_coding=true in settings.js');
                return "newAction not allowed! Code writing is disabled in settings. Notify the user.";
            }
            let result = "";
            const actionFn = async () => {
                try {
                    result = await agent.coder.generateCode(agent.history);
                } catch (e) {
                    result = 'Error generating code: ' + e.toString();
                }
            };
            await agent.actions.runAction('action:newAction', actionFn, {timeout: settings.code_timeout_mins});
            return result;
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent) {
            await agent.actions.stop();
            agent.clearBotLogs();
            agent.actions.cancelResume();
            agent.bot.emit('idle');
            let msg = 'Agent stopped.';
            if (agent.self_prompter.isActive())
                msg += ' Self-prompting still active.';
            return msg;
        }
    },
    {
        name: '!stfu',
        description: 'Stop all chatting and self prompting, but continue current action.',
        perform: async function (agent) {
            agent.openChat('Shutting up.');
            agent.shutUp();
            return;
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent) {
            agent.cleanKill();
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': {type: 'string', description: 'The name of the player to go to.'},
            'closeness': {type: 'float', description: 'How close to get to the player.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, closeness) => {
            await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player.',
        params: {
            'player_name': {type: 'string', description: 'name of the player to follow.'},
            'follow_dist': {type: 'float', description: 'The distance to follow from.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, true)
    },
    {
        name: '!goToCoordinates',
        description: 'Go to the given x, y, z location.',
        params: {
            'x': {type: 'float', description: 'The x coordinate.', domain: [-Infinity, Infinity]},
            'y': {type: 'float', description: 'The y coordinate.', domain: [-64, 320]},
            'z': {type: 'float', description: 'The z coordinate.', domain: [-Infinity, Infinity]},
            'closeness': {type: 'float', description: 'How close to get to the location.', domain: [0, Infinity]}
        },
        perform: runAsAction(async (agent, x, y, z, closeness) => {
            await skills.goToPosition(agent.bot, x, y, z, closeness);
        })
    },
    {
        name: '!searchForBlock',
        description: 'Find and go to the nearest block of a given type in a given range.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the block. Minimum 32.', domain: [10, 512] }
        },
        perform: runAsAction(async (agent, block_type, range) => {
            if (range < 32) {
                log(agent.bot, `Minimum search range is 32.`);
                range = 32;
            }
            await skills.goToNearestBlock(agent.bot, block_type, 4, range);
        })
    },
    {
        name: '!searchForEntity',
        description: 'Find and go to the nearest entity of a given type in a given range.',
        params: {
            'type': { type: 'string', description: 'The type of entity to go to.' },
            'search_range': { type: 'float', description: 'The range to search for the entity.', domain: [32, 512] }
        },
        perform: runAsAction(async (agent, entity_type, range) => {
            await skills.goToNearestEntity(agent.bot, entity_type, 4, range);
        })
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': { type: 'float', description: 'The distance to move away.', domain: [0, Infinity] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!rememberHere',
        description: 'Save the current location with a given name.',
        params: {'name': { type: 'string', description: 'The name to remember the location as.' }},
        perform: async function (agent, name) {
            const pos = agent.bot.entity.position;
            agent.memory_bank.rememberPlace(name, pos.x, pos.y, pos.z);
            return `Location saved as "${name}".`;
        }
    },
    {
        name: '!goToRememberedPlace',
        description: 'Go to a saved location.',
        params: {'name': { type: 'string', description: 'The name of the location to go to.' }},
        perform: runAsAction(async (agent, name) => {
            const pos = agent.memory_bank.recallPlace(name);
            if (!pos) {
            skills.log(agent.bot, `No location named "${name}" saved.`);
            return;
            }
            await skills.goToPosition(agent.bot, pos[0], pos[1], pos[2], 1);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': { type: 'string', description: 'The name of the player to give the item to.' }, 
            'item_name': { type: 'ItemName', description: 'The name of the item to give.' },
            'num': { type: 'int', description: 'The number of items to give.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!consume',
        description: 'Eat/drink the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to consume.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.consume(agent.bot, item_name);
        })
    },
    {
        name: '!equip',
        description: 'Equip the given item.',
        params: {'item_name': { type: 'ItemName', description: 'The name of the item to equip.' }},
        perform: runAsAction(async (agent, item_name) => {
            await skills.equip(agent.bot, item_name);
        })
    },
    {
        name: '!putInChest',
        description: 'Put the given item in the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to put in the chest.' },
            'num': { type: 'int', description: 'The number of items to put in the chest.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.putInChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!takeFromChest',
        description: 'Take the given items from the nearest chest.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to take.' },
            'num': { type: 'int', description: 'The number of items to take.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.takeFromChest(agent.bot, item_name, num);
        })
    },
    {
        name: '!viewChest',
        description: 'View the items/counts of the nearest chest.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.viewChest(agent.bot);
        })
    },
    {
        name: '!discard',
        description: 'Discard the given item from the inventory.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item to discard.' },
            'num': { type: 'int', description: 'The number of items to discard.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            const start_loc = agent.bot.entity.position;
            await skills.moveAway(agent.bot, 5);
            await skills.discard(agent.bot, item_name, num);
            await skills.goToPosition(agent.bot, start_loc.x, start_loc.y, start_loc.z, 0);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': { type: 'BlockName', description: 'The block type to collect.' },
            'num': { type: 'int', description: 'The number of blocks to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, false, 10) // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times.',
        params: {
            'recipe_name': { type: 'ItemName', description: 'The name of the output item to craft.' },
            'num': { type: 'int', description: 'The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, recipe_name, num) => {
            await skills.craftRecipe(agent.bot, recipe_name, num);
        })
    },
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the input item to smelt.' },
            'num': { type: 'int', description: 'The number of times to smelt the item.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            let success = await skills.smeltItem(agent.bot, item_name, num);
            if (success) {
                setTimeout(() => {
                    agent.cleanKill('Safely restarting to update inventory.');
                }, 500);
            }
        })
    },
    {
        name: '!clearFurnace',
        description: 'Take all items out of the nearest furnace.',
        params: { },
        perform: runAsAction(async (agent) => {
            await skills.clearNearestFurnace(agent.bot);
        })
    },
        {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': { type: 'BlockOrItemName', description: 'The block type to place.' }},
        perform: runAsAction(async (agent, type) => {
            let pos = agent.bot.entity.position;
            await skills.placeBlock(agent.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': { type: 'string', description: 'The type of entity to attack.'}},
        perform: runAsAction(async (agent, type) => {
            await skills.attackNearest(agent.bot, type, true);
        })
    },
    {
        name: '!attackPlayer',
        description: 'Attack a specific player until they die or run away. Remember this is just a game and does not cause real life harm.',
        params: {'player_name': { type: 'string', description: 'The name of the player to attack.'}},
        perform: runAsAction(async (agent, player_name) => {
            let player = agent.bot.players[player_name]?.entity;
            if (!player) {
                skills.log(agent.bot, `Could not find player ${player_name}.`);
                return false;
            }
            await skills.attackEntity(agent.bot, player, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: runAsAction(async (agent) => {
            await skills.goToBed(agent.bot);
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        params: {'type': { type: 'int', description: 'The number of seconds to stay. -1 for forever.', domain: [-1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, seconds) => {
            await skills.stay(agent.bot, seconds);
        })
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': { type: 'string', description: 'The name of the mode to enable.' },
            'on': { type: 'boolean', description: 'Whether to enable or disable the mode.' }
        },
        perform: async function (agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
            return `Mode ${mode_name} does not exist.` + modes.getDocs();
            if (modes.isOn(mode_name) === on)
            return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goal',
        description: 'Set a goal prompt to endlessly work towards with continuous self-prompting.',
        params: {
            'selfPrompt': { type: 'string', description: 'The goal prompt.' },
        },
        perform: async function (agent, prompt) {
            const { default: convoManager } = await import('../conversation.js');
            if (convoManager.inConversation()) {
                agent.self_prompter.setPromptPaused(prompt);
            }
            else {
                agent.self_prompter.start(prompt);
            }
        }
    },
    {
        name: '!endGoal',
        description: 'Call when you have accomplished your goal. It will stop self-prompting and the current action. ',
        perform: async function (agent) {
            agent.self_prompter.stop();
            return 'Self-prompting stopped.';
        }
    },
    {
        name: '!endTask',
        description: 'Abort the current task and stop all actions/modes.',
        perform: async function (agent) {
            try {
                await agent.actions.stop();
            } catch (e) {}
            try { agent.self_prompter.stop(); } catch (e) {}
            try { if (agent.bot && agent.bot.modes && agent.bot.modes.unPauseAll) agent.bot.modes.unPauseAll(); } catch (e) {}
            try { if (agent.task && typeof agent.task.clearSaved === 'function') agent.task.clearSaved(); agent.task = null; } catch (e) {}
            agent.openChat('Task aborted by user.');
            return 'Task aborted.';
        }
    },
    {
        name: '!train',
        description: 'Start continuous self-training using the learning brain until stopped with !stopTrain.',
        perform: async function(agent) {
            if (!agent.learningBrain) {
                // Attempt lazy initialization so CLI/shim users can start training
                try {
                    const brainModule = await import('../learning/ultimate_brain.js');
                    // allow brain to be created and initialized on demand
                    agent.learningBrain = new brainModule.UltimateBotBrain(agent.name || (agent.bot && agent.bot.username) || 'Agent');
                    if (agent.bot) {
                        // Initialize asynchronously so the action doesn't block the manager
                        agent.learningBrain.initialize(agent.bot).catch(err => console.warn('[TRAIN] async init failed:', err));
                    } else {
                        console.warn('[TRAIN] Agent has no bot attached; brain initialized without bot reference.');
                    }
                } catch (err) {
                    console.error('[TRAIN] Failed to initialize learning brain:', err);
                    return 'No learning brain initialized for this agent.';
                }
            }
            try {
                // Start training asynchronously so the action returns immediately
                agent.learningBrain.startTraining().catch(err => console.warn('[TRAIN] startTraining failed:', err));
                return 'Training started.';
            } catch (e) {
                return 'Failed to start training: ' + String(e);
            }
        }
    },
    {
        name: '!stopTrain',
        description: 'Stop continuous training started by !train.',
        perform: async function(agent) {
            if (!agent.learningBrain) return 'No learning brain initialized.';
            try {
                agent.learningBrain.stopTraining();
                return 'Training stopped and saved.';
            } catch (e) {
                return 'Failed to stop training: ' + String(e);
            }
        }
    },
    {
        name: '!trainStatus',
        description: 'Show training status and recent metrics.',
        perform: async function(agent) {
            if (!agent.learningBrain) return 'No learning brain initialized.';
            try {
                const brain = agent.learningBrain;
                const status = {
                    training: !!brain.training,
                    sessionId: brain.session?.id,
                    savedSessions: (await (async () => { try { const fs = await import('fs'); const files = fs.readdirSync(brain.dataDir); return files.filter(f=>f.startsWith('session_')).length } catch(e){return 0}})()),
                    lastSnapshotCount: brain.session?.stateSnapshots?.length || 0
                };
                return JSON.stringify(status, null, 2);
            } catch (e) {
                return 'Failed to get training status: ' + String(e);
            }
        }
    },
    {
        name: '!evolve',
        description: 'Run neuroevolution on saved sessions to produce an evolved master brain (may be CPU intensive).',
        params: { 'botName': { type: 'string', description: 'Bot name to evolve (defaults to this agent)' } },
        perform: async function(agent, botName) {
            try {
                const name = botName || agent.name;
                const { spawn } = await import('child_process');
                const node = process.execPath;
                const script = './scripts/neuroevolve.js';
                const args = ['--bot', name];
                const child = spawn(node, [script, ...args], { stdio: 'inherit' });
                return `Evolver started for ${name}`;
            } catch (e) {
                return 'Failed to start evolver: ' + String(e);
            }
        }
    },
    {
        name: '!showVillagerTrades',
        description: 'Show trades of a specified villager.',
        params: {'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' }},
        perform: runAsAction(async (agent, id) => {
            await skills.showVillagerTrades(agent.bot, id);
        })
    },
    {
        name: '!tradeWithVillager',
        description: 'Trade with a specified villager.',
        params: {
            'id': { type: 'int', description: 'The id number of the villager that you want to trade with.' },
            'index': { type: 'int', description: 'The index of the trade you want executed (1-indexed).', domain: [1, Number.MAX_SAFE_INTEGER] },
            'count': { type: 'int', description: 'How many times that trade should be executed.', domain: [1, Number.MAX_SAFE_INTEGER] },
        },
        perform: runAsAction(async (agent, id, index, count) => {
            await skills.tradeWithVillager(agent.bot, id, index, count);
        })
    },
    {
        name: '!startConversation',
        description: 'Start a conversation with a bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to send the message to.' },
            'message': { type: 'string', description: 'The message to send.' },
        },
        perform: async function (agent, player_name, message) {
            const { default: convoManager } = await import('../conversation.js');
            if (!convoManager.isOtherAgent(player_name))
                return player_name + ' is not a bot, cannot start conversation.';
            if (convoManager.inConversation() && !convoManager.inConversation(player_name))
                convoManager.forceEndCurrentConversation();
            else if (convoManager.inConversation(player_name))
                agent.history.add('system', 'You are already in conversation with ' + player_name + '. Don\'t use this command to talk to them.');
            convoManager.startConversation(player_name, message);
        }
    },
    {
        name: '!endConversation',
        description: 'End the conversation with the given bot. (FOR OTHER BOTS ONLY)',
        params: {
            'player_name': { type: 'string', description: 'The name of the player to end the conversation with.' }
        },
        perform: async function (agent, player_name) {
            const { default: convoManager } = await import('../conversation.js');
            if (!convoManager.inConversation(player_name))
                return `Not in conversation with ${player_name}.`;
            convoManager.endConversation(player_name);
            return `Converstaion with ${player_name} ended.`;
        }
    },
    {
        name: '!lookAtPlayer',
        description: 'Look at a player or look in the same direction as the player.',
        params: {
            'player_name': { type: 'string', description: 'Name of the target player' },
            'direction': {
                type: 'string',
                description: 'How to look ("at": look at the player, "with": look in the same direction as the player)',
            }
        },
        perform: async function(agent, player_name, direction) {
            if (direction !== 'at' && direction !== 'with') {
                return "Invalid direction. Use 'at' or 'with'.";
            }
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPlayer(player_name, direction);
            };
            await agent.actions.runAction('action:lookAtPlayer', actionFn);
            return result;
        }
    },
    {
        name: '!lookAtPosition',
        description: 'Look at specified coordinates.',
        params: {
            'x': { type: 'int', description: 'x coordinate' },
            'y': { type: 'int', description: 'y coordinate' },
            'z': { type: 'int', description: 'z coordinate' }
        },
        perform: async function(agent, x, y, z) {
            let result = "";
            const actionFn = async () => {
                result = await agent.vision_interpreter.lookAtPosition(x, y, z);
            };
            await agent.actions.runAction('action:lookAtPosition', actionFn);
            return result;
        }
    },
    {
        name: '!digDown',
        description: 'Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.',
        params: {'distance': { type: 'int', description: 'Distance to dig down', domain: [1, Number.MAX_SAFE_INTEGER] }},
        perform: runAsAction(async (agent, distance) => {
            await skills.digDown(agent.bot, distance)
        })
    },
    {
        name: '!goToSurface',
        description: 'Moves the bot to the highest block above it (usually the surface).',
        params: {},
        perform: runAsAction(async (agent) => {
            await skills.goToSurface(agent.bot);
        })
    },
    {
        name: '!useOn',
        description: 'Use (right click) the given tool on the nearest target of the given type.',
        params: {
            'tool_name': { type: 'string', description: 'Name of the tool to use, or "hand" for no tool.' },
            'target': { type: 'string', description: 'The target as an entity type, block type, or "nothing" for no target.' }
        },
        perform: runAsAction(async (agent, tool_name, target) => {
            await skills.useToolOn(agent.bot, tool_name, target);
        })
    },
    {
        name: '!leave',
        description: 'Disconnect from the server.',
        perform: async function (agent) {
            agent.bot.quit();
            return 'Disconnecting from server...';
        }
    },
    {
        name: '!mine',
        description: 'Mine and collect a specified item. Replace BLANK with the item name (e.g., stone, oak_log, iron_ore).',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item/block to mine and collect.' },
            'num': { type: 'int', description: 'The number of items to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.collectBlock(agent.bot, item_name, num);
        }, false, 30) // 30 minute timeout for long mining operations
    },
    {
        name: '!collect',
        description: 'Collect a specified item. Alias for !mine command.',
        params: {
            'item_name': { type: 'ItemName', description: 'The name of the item/block to collect.' },
            'num': { type: 'int', description: 'The number of items to collect.', domain: [1, Number.MAX_SAFE_INTEGER] }
        },
        perform: runAsAction(async (agent, item_name, num) => {
            await skills.collectBlock(agent.bot, item_name, num);
        }, false, 30)
    },
    {
        name: '!speedrun',
        description: 'Attempt to beat the game as quickly as possible by finding and defeating the Ender Dragon. Will use the quickest methods available.',
        perform: runAsAction(async (agent) => {
            const bot = agent.bot;
            agent.openChat('Starting speedrun mode! Preparing and searching for stronghold...');

            try {
                // 1) Ensure basic sustenance
                if (bot.food < 14) {
                    agent.openChat('Low food, gathering food...');
                    await skills.collectBlock(bot, 'beef', 8).catch(()=>{});
                    await skills.pickupNearbyItems(bot).catch(()=>{});
                    // try to eat until comfortable
                    try { await skills.consume(bot, 'beef'); } catch(e){}
                }

                // 2) Gather wood and stone for tools
                agent.openChat('Gathering wood and stone...');
                await skills.collectBlock(bot, 'oak_log', 24).catch(()=>{});
                await skills.collectBlock(bot, 'stone', 64).catch(()=>{});

                // 3) Craft basic tools (try stone tools)
                agent.openChat('Attempting to craft basic tools...');
                await skills.craftRecipe(bot, 'sticks', 4).catch(()=>{});
                await skills.craftRecipe(bot, 'crafting_table', 1).catch(()=>{});
                await skills.craftRecipe(bot, 'stone_pickaxe', 1).catch(()=>{});
                await skills.craftRecipe(bot, 'stone_sword', 1).catch(()=>{});

                // 4) Look for iron and gather
                agent.openChat('Searching for iron ore...');
                const foundIron = await skills.goToNearestBlock(bot, 'iron_ore', 4, 128).catch(()=>false);
                if (foundIron) {
                    await skills.collectBlock(bot, 'iron_ore', 16).catch(()=>{});
                    // try smelting some iron
                    await skills.smeltItem(bot, 'raw_iron', 16).catch(()=>{});
                    await skills.craftRecipe(bot, 'iron_pickaxe', 1).catch(()=>{});
                    await skills.craftRecipe(bot, 'iron_sword', 1).catch(()=>{});
                }

                // 5) Prepare for locating stronghold / end portal frames
                agent.openChat('Searching for end portal frame / stronghold...');
                // try several ranges progressively
                let found = false;
                const ranges = [128, 256, 512];
                for (const r of ranges) {
                    if (await skills.goToNearestBlock(bot, 'ender_portal_frame', 4, r).catch(()=>false)) {
                        found = true; break;
                    }
                    // short wait before next range
                    await skills.wait(bot, 1000).catch(()=>{});
                }

                if (!found) {
                    agent.openChat('Could not find an end portal frame nearby. Continuing exploration and gearing...');
                    // fallback: wander and look
                    for (let i=0;i<6;i++) {
                        await skills.moveAway(bot, 30).catch(()=>{});
                        await skills.wait(bot, 2000).catch(()=>{});
                        if (await skills.goToNearestBlock(bot, 'ender_portal_frame', 4, 512).catch(()=>false)) { found = true; break; }
                    }
                }

                if (found) {
                    agent.openChat('Found stronghold / portal area! Moving to investigate.');
                } else {
                    agent.openChat('Exploration complete for now; no portal frames found. Continue searching later.');
                }
                return found ? 'Speedrun: reached portal area (or found frames).' : 'Speedrun: no portal frames found yet — continuing exploration in background.';
            } catch (err) {
                console.error('Speedrun failed:', err);
                return 'Speedrun failed: ' + String(err);
            }
        }, false, 120) // 2 hour timeout for speedrun
    },
    {
        name: '!survive',
        description: 'Focus on survival - get better gear and resources. Seeks diamonds, food, and basic materials.',
        perform: runAsAction(async (agent) => {
            agent.openChat('Entering survival mode - gathering resources and upgrading gear...');
            
            // Simple survival loop
            const survivalLoop = async () => {
                // Look for food first if hungry
                if (agent.bot.food < 18) {
                    await skills.collectBlock(agent.bot, 'beef', 5);
                    await skills.consume(agent.bot, 'beef');
                    return;
                }
                
                // Collect wood if needed
                const wood = agent.bot.inventory.findInventoryObject({ name: 'oak_log' });
                if (!wood || wood.count < 10) {
                    await skills.collectBlock(agent.bot, 'oak_log', 16);
                    return;
                }
                
                // Collect stone for tools
                const stone = agent.bot.inventory.findInventoryObject({ name: 'stone' });
                if (!stone || stone.count < 32) {
                    await skills.collectBlock(agent.bot, 'stone', 32);
                    return;
                }
                
                // Look for diamonds
                await skills.goToNearestBlock(agent.bot, 'diamond_ore', 4, 128);
            };
            
            await survivalLoop();
        }, true, 60) // 1 hour timeout, resumable
    },
    {
        name: '!protect',
        description: 'Protect a specified player or object by staying near them and defending against threats.',
        params: {
            'target': { type: 'string', description: 'The name of the player or object to protect (e.g., player name or "base").' }
        },
        perform: runAsAction(async (agent, target) => {
            agent.openChat(`Protecting ${target}...`);
            
            if (target.toLowerCase() === 'base') {
                // Protect base - stay in place and defend
                await skills.stay(agent.bot, -1);
            } else {
                // Follow and protect player
                let checkDistance = setInterval(() => {
                    const player = agent.bot.players[target];
                    if (player && agent.bot.entity.position.distanceTo(player.entity.position) > 10) {
                        skills.log(agent.bot, `${target} is being attacked! Moving to help...`);
                    }
                }, 1000);
                
                await skills.followPlayer(agent.bot, target, 5);
                clearInterval(checkDistance);
            }
        }, true, 120) // 2 hour timeout, resumable for continuous protection
    },
    {
        name: '!pvp',
        description: 'Engage in PvP combat. Attack a specific player or all nearby players.',
        params: {
            'target': { type: 'string', description: 'The name of the player to attack, or "all" to attack all nearby hostile entities.' }
        },
        perform: runAsAction(async (agent, target) => {
            if (target.toLowerCase() === 'all') {
                agent.openChat('Attacking all nearby hostile entities...');
                // Attack all hostile mobs
                const hostileTypes = ['creeper', 'skeleton', 'zombie', 'enderman', 'spider', 'witch', 'slime', 'cave_spider'];
                for (let mobType of hostileTypes) {
                    const entities = agent.bot.nearestEntity((entity) => entity.type === mobType);
                    if (entities) {
                        await skills.attackNearest(agent.bot, mobType, true);
                    }
                }
            } else {
                // Attack specific player
                agent.openChat(`PvP mode - attacking ${target}...`);
                const player = agent.bot.players[target];
                if (player) {
                    await skills.attackEntity(agent.bot, player.entity, true);
                } else {
                    agent.openChat(`Player ${target} not found!`);
                }
            }
        }, false, 120) // 2 hour timeout
    },
    {
        name: '!buildEmpire',
        description: 'Build a base, farm, collect resources, upgrade gear to diamond, and build a villager trading hall.',
        perform: runAsAction(async (agent) => {
            agent.openChat('Starting empire building... this will take a while!');
            
            const buildBase = async () => {
                const pos = agent.bot.entity.position;
                agent.openChat('Building base structure...');
                
                // Collect wood for base
                await skills.collectBlock(agent.bot, 'oak_log', 64);
                
                // Collect stone for construction
                await skills.collectBlock(agent.bot, 'stone', 64);
                
                // Collect dirt for foundation
                await skills.collectBlock(agent.bot, 'dirt', 32);
            };
            
            const collectResources = async () => {
                agent.openChat('Collecting resources for upgrade...');
                
                // Mine iron for better tools
                await skills.collectBlock(agent.bot, 'iron_ore', 32);
                
                // Smelt iron
                await skills.smeltItem(agent.bot, 'iron_ore', 32);
                
                // Get diamonds
                await skills.collectBlock(agent.bot, 'diamond_ore', 6);
            };
            
            const upgradeToDiamond = async () => {
                agent.openChat('Upgrading gear to diamond...');
                
                // Craft diamond tools and armor
                await skills.craftRecipe(agent.bot, 'diamond_pickaxe', 1);
                await skills.craftRecipe(agent.bot, 'diamond_axe', 1);
                await skills.craftRecipe(agent.bot, 'diamond_chestplate', 1);
                await skills.craftRecipe(agent.bot, 'diamond_leggings', 1);
                await skills.craftRecipe(agent.bot, 'diamond_boots', 1);
                
                // Equip them
                await skills.equip(agent.bot, 'diamond_chestplate');
                await skills.equip(agent.bot, 'diamond_leggings');
                await skills.equip(agent.bot, 'diamond_boots');
            };
            
            const buildVillagerTradingHall = async () => {
                agent.openChat('Building villager trading hall...');
                
                // Collect materials for trading hall
                await skills.collectBlock(agent.bot, 'oak_planks', 128);
                await skills.collectBlock(agent.bot, 'oak_stairs', 64);
                
                agent.openChat('Trading hall setup started. May need manual completion for optimal layout.');
            };
            
            // Execute all phases
            await buildBase();
            await collectResources();
            await upgradeToDiamond();
            await buildVillagerTradingHall();
            
            agent.openChat('Empire building complete! Base established with diamond gear.');
        }, false, 480) // 8 hour timeout for full empire building
    },
    {
        name: '!trade',
        description: 'Trade with villagers. Use this to find villagers and execute trades to get rare items.',
        params: {
            'action': { type: 'string', description: 'Either "find" to search for nearby villagers, "show ID" to show trades, or "execute ID INDEX COUNT" to trade.' }
        },
        perform: runAsAction(async (agent, action) => {
            const actionParts = action.split(' ');
            
            if (actionParts[0].toLowerCase() === 'find') {
                agent.openChat('Searching for nearby villagers...');
                await skills.goToNearestEntity(agent.bot, 'villager', 4, 128);
            } else if (actionParts[0].toLowerCase() === 'show' && actionParts[1]) {
                const id = parseInt(actionParts[1]);
                await skills.showVillagerTrades(agent.bot, id);
            } else if (actionParts[0].toLowerCase() === 'execute' && actionParts[1] && actionParts[2] && actionParts[3]) {
                const id = parseInt(actionParts[1]);
                const index = parseInt(actionParts[2]);
                const count = parseInt(actionParts[3]);
                await skills.tradeWithVillager(agent.bot, id, index, count);
            } else {
                return 'Invalid trade command. Use: !trade(find) or !trade("show ID") or !trade("execute ID INDEX COUNT")';
            }
        })
    },
    {
        name: '!farm',
        description: 'Set up a basic farm with crops and start harvesting.',
        params: {
            'crop_type': { type: 'string', description: 'Type of crop to farm (wheat, carrots, potatoes, etc.).' }
        },
        perform: runAsAction(async (agent, crop_type) => {
            agent.openChat(`Setting up ${crop_type} farm...`);
            
            // Collect seeds and soil
            await skills.collectBlock(agent.bot, 'farmland', 16);
            
            // Plant crops
            for (let i = 0; i < 16; i++) {
                await skills.plantCrop(agent.bot, crop_type);
            }
            
            agent.openChat('Farm planted! Will harvest when crops grow.');
        }, false, 30)
    },
    {
        name: '!fish',
        description: 'Go to water and fish for items.',
        perform: runAsAction(async (agent) => {
            agent.openChat('Preparing to fish...');

            // Ensure we have a fishing rod; try crafting first
            const { getInventoryCounts } = await import('../library/world.js');
            let inv = getInventoryCounts(agent.bot);
            if (!inv['fishing_rod']) {
                agent.openChat('No fishing rod found; attempting to craft one.');
                let crafted = await skills.craftRecipe(agent.bot, 'fishing_rod', 1).catch(() => false);
                if (!crafted) {
                    agent.openChat('Crafting fishing rod failed; attempting to collect resources.');
                    // Ensure sticks
                    inv = getInventoryCounts(agent.bot);
                    if (!inv['stick'] || inv['stick'] < 2) {
                        agent.openChat('Collecting wood to make sticks...');
                        await skills.collectBlock(agent.bot, 'oak_log', 4).catch(()=>{});
                        await skills.craftRecipe(agent.bot, 'stick', 4).catch(()=>{});
                    }
                    // Ensure string - try to hunt spiders
                    inv = getInventoryCounts(agent.bot);
                    if (!inv['string'] || inv['string'] < 1) {
                        agent.openChat('No string found; hunting spiders for string...');
                        // try up to 3 spiders
                        for (let attempt=0; attempt<3; attempt++) {
                            let got = await skills.attackNearest(agent.bot, 'spider', true).catch(()=>false);
                            if (got) break;
                            // wait a bit before trying again
                            await skills.wait(agent.bot, 3000);
                        }
                    }
                    // Try craft again
                    crafted = await skills.craftRecipe(agent.bot, 'fishing_rod', 1).catch(()=>false);
                    if (!crafted) {
                        agent.openChat('Failed to obtain a fishing rod. Aborting fish task.');
                        return 'Failed to prepare fishing rod.';
                    }
                }
            }

            agent.openChat('Looking for water to fish...');

            // Go to nearest water
            await skills.goToNearestBlock(agent.bot, 'water', 4, 128);

            agent.openChat('Fishing... this may take a while!');

            // Fish for a while, but allow interruption
            for (let i = 0; i < 60; i++) {
                if (agent.bot.interrupt_code) break;
                await skills.wait(agent.bot, 5000);
                await skills.pickupNearbyItems(agent.bot).catch(()=>{});
            }
            return 'Fishing task completed or interrupted.';
        }, false, 60)
    },
    {
        name: '!hunt',
        description: 'Hunt and kill animals for food and materials.',
        params: {
            'animal_type': { type: 'string', description: 'Type of animal to hunt (cow, pig, sheep, chicken, etc.).' }
        },
        perform: runAsAction(async (agent, animal_type) => {
            agent.openChat(`Hunting ${animal_type}...`);
            await skills.attackNearest(agent.bot, animal_type, true);
            
            // Collect drops
            await skills.wait(agent.bot, 1000);
            await skills.pickupNearbyItems(agent.bot);
        }, false, 30)
    },
    {
        name: '!sleep',
        description: 'Find and sleep in the nearest bed to reset day/night and restore health.',
        perform: runAsAction(async (agent) => {
            agent.openChat('Looking for a bed to sleep in...');
            await skills.goToBed(agent.bot);
            agent.openChat('Zzz... sleeping...');
        }, false, 30)
    },
    {
        name: '!heal',
        description: 'Find food and eat to restore health.',
        perform: runAsAction(async (agent) => {
            const health = agent.bot.health;
            if (health >= 20) {
                return 'Already at full health!';
            }
            
            agent.openChat('Looking for food to heal...');
            
            // Try to find and eat food
            const food = agent.bot.inventory.findInventoryObject({ name: 'beef' });
            if (food) {
                await skills.consume(agent.bot, 'beef');
            } else {
                // Hunt for food
                await skills.attackNearest(agent.bot, 'cow', true);
                await skills.pickupNearbyItems(agent.bot);
                await skills.consume(agent.bot, 'beef');
            }
        }, false, 30)
    },
    {
        name: '!inventory',
        description: 'Show current inventory contents.',
        perform: async function (agent) {
            const inventory = agent.bot.inventory.items();
            if (inventory.length === 0) {
                return 'Inventory is empty!';
            }
            
            let inventoryStr = 'Current inventory:\n';
            inventory.forEach(item => {
                inventoryStr += `${item.name}: ${item.count}\n`;
            });
            
            agent.openChat(inventoryStr);
            return inventoryStr;
        }
    },
    {
        name: '!stats',
        description: 'Show bot status and statistics.',
        perform: async function (agent) {
            const pos = agent.bot.entity.position;
            const stats = `
Bot: ${agent.name}
Health: ${agent.bot.health.toFixed(1)}/20
Food: ${agent.bot.food}/20
Position: X: ${Math.floor(pos.x)}, Y: ${Math.floor(pos.y)}, Z: ${Math.floor(pos.z)}
Dimension: ${agent.bot.game.dimension}
            `;
            
            agent.openChat(stats);
            return stats;
        }
    },
];
