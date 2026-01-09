# Mindcraft Utility Bot Guide

This document has been merged into [MERGED_FULL.md](MERGED_FULL.md). Please open that file for the consolidated documentation.

Mindcraft now includes a complete **Utility Bot System** that allows you to deploy bots without requiring an LLM (Large Language Model). These bots can perform various tasks using simple commands and can even beat the Minecraft game.

## Features

### 🎯 Available Commands

#### Server Management
- **`!leave`** - Disconnect from the server

#### Mining & Collecting
- **`!mine <item> <quantity>`** - Mine and collect a specified item (e.g., `!mine("stone", 64)`)
- **`!collect <item> <quantity>`** - Alias for mine command

#### Gameplay Modes
- **`!speedrun`** - Attempt to beat the game as quickly as possible by finding and defeating the Ender Dragon
- **`!survive`** - Focus on survival mode: gather resources, hunt for food, collect wood and stone
- **`!protect <target>`** - Protect a player or base (e.g., `!protect("Steve")` or `!protect("base")`)
- **`!pvp <player>`** - Engage in PvP combat with a specific player or all nearby entities (e.g., `!pvp("all")`)

#### Base Building
- **`!buildEmpire`** - Complete base building sequence:
  - Builds a structure
  - Collects resources (wood, stone, dirt)
  - Mines iron and diamonds
  - Upgrades gear to full diamond
  - Builds a villager trading hall

#### Resource Management
- **`!farm <crop>`** - Set up and manage farms (wheat, carrots, potatoes, etc.)
- **`!fish`** - Go to water and fish for items
- **`!hunt <animal>`** - Hunt animals for food and materials (cow, pig, sheep, etc.)
- **`!trade <action>`** - Trade with villagers
  - `!trade("find")` - Find nearby villagers
  - `!trade("show ID")` - Show available trades
  - `!trade("execute ID INDEX COUNT")` - Execute a trade

#### Survival & Health
- **`!sleep`** - Find and sleep in a bed to reset day/night
- **`!heal`** - Find food and restore health
- **`!consume <item>`** - Eat/drink an item
- **`!equip <item>`** - Equip an item or tool

#### Navigation & Exploration
- **`!goToPlayer <name> <distance>`** - Go to a specific player
- **`!goToCoordinates <x> <y> <z> <closeness>`** - Go to specific coordinates
- **`!searchForBlock <block> <range>`** - Find and go to a block type
- **`!searchForEntity <entity> <range>`** - Find and go to an entity type
- **`!moveAway <distance>`** - Move away in any direction

#### Inventory & Storage
- **`!inventory`** - View current inventory
- **`!collectBlocks <block> <quantity>`** - Collect specific blocks
- **`!putInChest <item> <quantity>`** - Put items in nearest chest
- **`!takeFromChest <item> <quantity>`** - Take items from nearest chest
- **`!viewChest`** - View nearest chest contents
- **`!discard <item> <quantity>`** - Discard items

#### Crafting & Smelting
- **`!craftRecipe <item> <quantity>`** - Craft items (e.g., `!craftRecipe("sticks", 1)`)
- **`!smeltItem <item> <quantity>`** - Smelt items in a furnace
- **`!clearFurnace`** - Collect all items from nearest furnace

#### Combat & Defense
- **`!attack <entity>`** - Attack and kill a mob type
- **`!attackPlayer <player>`** - Attack a specific player
- **`!stay <seconds>`** - Stay in place (no matter what), -1 for forever

#### Information
- **`!stats`** - Show bot status (health, food, position, dimension)

## Deployment Guide

### Quick Start

1. **Open Mindcraft Dashboard**
   - Start Mindcraft normally
   - Dashboard opens automatically at `http://localhost:8080`

2. **Click "Deploy Utility Bot" Button**
   - Click the purple "Deploy Utility Bot" button at the bottom of the dashboard
   - This opens the deployment wizard

3. **Fill in Bot Details**
   - **Bot Name**: Choose a name for your bot (e.g., "Miner", "Farmer")
   - **Connection Type**: Select how to connect
     - **Localhost**: For local servers
     - **LAN**: For LAN servers
     - **IP Address**: For remote servers
   - **Server IP**: Your server's IP address (auto-filled for localhost/LAN)
   - **Server Port**: Your server's port (default: 25565 or your custom port)
   - **Server Name**: Optional - name of your world/server

4. **Click Deploy**
   - Bot will connect and appear in the dashboard
   - Once connected, you can send it commands

### Configuration

Bots can be deployed with different configurations:

```javascript
{
  botName: "MinerBot",
  serverIp: "127.0.0.1",
  serverPort: 25565,
  serverName: "MyWorld",
  initialMode: "survive"  // Optional: start with a mode
}
```

### Sending Commands

After deployment, send commands to your bot through the dashboard:

1. Select the bot in the dashboard
2. Type a command in the message input (with `!` prefix)
3. Send and watch it execute!

Example commands:
```
!mine("stone", 64)
!survive
!buildEmpire
!trade("find")
!stats
```

## Bot Modes

### Mode System

Bots can operate in different modes using the `!setMode` command:

```
!setMode("mode_name", true)   // Enable mode
!setMode("mode_name", false)  // Disable mode
```

### Available Modes (if enabled in your Mindcraft setup)

- **survive**: Continuously work toward survival
- **combat**: Engage with hostile mobs
- **farm**: Manage farming operations
- **build**: Continue building operations

## Advanced Usage

### Creating Custom Profiles

You can create custom bot profiles in the `profiles/` directory:

```json
{
  "name": "AdvancedMiner",
  "type": "miner",
  "blockPreferences": ["diamond_ore", "gold_ore", "iron_ore"],
  "settings": {
    "autoSell": true,
    "avoidLava": true,
    "minSafeDistance": 10
  }
}
```

### Combining Commands

Chain commands together by sending them one after another:

```
1. !mine("oak_log", 16)
2. !craftRecipe("sticks", 1)
3. !craftRecipe("crafting_table", 1)
4. !collectBlocks("stone", 32)
```

### Protecting Valuable Locations

Use the protect command to defend a specific area:

```
!protect("base")        // Protect your base location
!protect("PlayerName")  // Protect a specific player
```

## Troubleshooting

### Bot Won't Connect
- ✓ Ensure your Minecraft server is running
- ✓ Check that the server port is correct
- ✓ For remote servers, ensure the server is open to LAN or public
- ✓ Try localhost or 127.0.0.1 for local servers

### Bot Gets Stuck
- Send `!stop` to halt current action
- Send `!stay(0)` to unstick the bot
- Try `!moveAway(10)` to move away from obstacles

### Command Not Working
- Make sure you're using the `!` prefix
- Check the command syntax matches examples
- Verify the bot is in-game (green indicator in dashboard)
- Check bot's output/logs in dashboard

### Performance Issues
- Reduce the number of deployed bots
- Close other resource-intensive applications
- Check your Minecraft server's performance

## Example Workflows

### Mining Operation
```
1. !survive  // Gather initial resources
2. !mine("oak_log", 32)
3. !mine("stone", 64)
4. !mine("iron_ore", 32)
5. !mine("coal_ore", 16)
```

### Base Building
```
1. !buildEmpire  // Automatic empire building
2. !farm("wheat")  // Add wheat farm
3. !fish  // Go fishing
4. !trade("find")  // Find villagers
```

### Speedrun
```
!speedrun  // Attempts to beat the game
```

### Survival Setup
```
1. !survive  // Initial survival
2. !hunt("cow")  // Get food
3. !sleep  // Sleep through night
4. !heal  // Restore health
5. !protect("base")  // Protect your base
```

## API Integration

You can also deploy bots programmatically using the API:

```bash
curl -X POST http://localhost:8080/api/deploy-bot \
  -H "Content-Type: application/json" \
  -d '{
    "botName": "AutoFarmer",
    "serverIp": "127.0.0.1",
    "serverPort": 25565,
    "serverName": "MyWorld",
    "initialMode": "farm"
  }'
```

Get list of deployed bots:

```bash
curl http://localhost:8080/api/bots
```

## Tips & Best Practices

1. **Name Your Bots Descriptively**
   - Use names like "Miner", "Farmer", "Builder" to remember their purpose

2. **Use Protected Bases**
   - Deploy a bot with `!protect("base")` to defend your main base

3. **Farming Operations**
   - Set up multiple farm bots with `!farm` commands
   - They can work in parallel without interfering

4. **Resource Gathering**
   - Use `!mine` for specific resources
   - Use `!collect` as an alias
   - Combine with `!putInChest` to organize materials

5. **Monitor Bot Health**
   - Check `!stats` regularly
   - Use `!heal` when health is low
   - Keep beds near your base for `!sleep`

6. **Combat Strategy**
   - Don't engage superior enemies without preparation
   - Use `!survive` to gather gear first
   - Use `!pvp("all")` carefully - players might retaliate

## Command Syntax

Commands use the format: `!commandName("param1", param2, param3)`

- Strings go in quotes: `"value"`
- Numbers don't need quotes: `64`
- Booleans: `true` or `false`

Examples:
```
!mine("stone", 64)
!goToCoordinates(100, 64, 200, 2)
!collectBlocks("oak_log", 32)
!trade("execute 5 1 10")
```

## Support & Issues

If you encounter issues:

1. Check the bot's output in the dashboard
2. Review command syntax in the guide
3. Try the troubleshooting section above
4. Check that your Minecraft server is running
5. Verify network connectivity to the server

## What's Next?

- Try deploying multiple bots with different roles
- Combine commands to create complex automation
- Use the speedrun mode to race against others
- Set up a farming network for resource production
- Build a complete automated base

Enjoy your utility bots! 🎮
