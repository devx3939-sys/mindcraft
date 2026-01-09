# Documentation Merged

This document has been merged into [MERGED_FULL.md](MERGED_FULL.md). Please open that file for the full consolidated documentation.
| Localhost | Auto-filled | 127.0.0.1:25565 |
| LAN | Auto-filled | localhost:25565 |
| Remote IP | Type IP | 192.168.1.100:25565 |

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot won't connect | Check server is running and port is correct |
| Bot gets stuck | Send `!stop` then `!moveAway(10)` |
| Command fails | Check syntax matches examples, verify bot is in-game |
| Server not found | Verify IP address and port number |

Files & Training
| Training session files | Saved under `data/bot_brain/<BotName>/sessions/` as `session_<id>_fitness_<n>_<ts>.json` |
| Master brain file | `data/bot_brain/<BotName>/MASTER_BRAIN_<BotName>.json` |

## 📊 Example Workflows

### Quick Resources
```
!mine("oak_log", 64)
!mine("stone", 64)
!craftRecipe("crafting_table", 1)
```

### Prepare for Battle
```
!survive
!mine("iron_ore", 32)
!smeltItem("iron_ore", 32)
!craftRecipe("iron_sword", 1)
```

### Build a Base
```
!buildEmpire
!farm("wheat")
!fish
```

### Speedrun
```
!speedrun
```

## 💡 Pro Tips

✓ Use `!stats` to check bot status anytime
✓ Chain commands - send one, wait, send next
✓ Use `!farm` to set up automated food source
✓ Use `!protect("base")` to defend your base
✓ Check bot output in dashboard for details
✓ `!trade("find")` before `!trade("show ID")`

## 🎮 Command Categories

### Survival (4 commands)
`!survive` `!hunt` `!sleep` `!heal`

### Building (2 commands)
`!buildEmpire` `!farm`

### Combat (3 commands)
`!pvp` `!protect` `!attack`

### Mining (2 commands)
`!mine` `!collect`

### Inventory (4 commands)
`!inventory` `!putInChest` `!takeFromChest` `!equip`

### Crafting (3 commands)
`!craftRecipe` `!smeltItem` `!clearFurnace`

### Trading (1 command)
`!trade`

### Navigation (4 commands)
`!goToPlayer` `!goToCoordinates` `!searchForBlock` `!moveAway`

### Other (8+ commands)
`!stats` `!sleep` `!fish` `!speedrun` `!consume` `!discard` `!leave`

---

**Need more help?** See [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) for complete documentation!
