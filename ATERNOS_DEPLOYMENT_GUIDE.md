# Mindcraft Bot Deployment to Aternos Servers

## Overview

This guide explains how to deploy Mindcraft utility bots to Aternos servers and ensure they connect properly as real players appearing in the tab list.

## Prerequisites

- **Running Mindcraft Server**: `npm start` running on localhost:8080
- **Aternos Server**: An active Aternos server with online-mode enabled
- **Server Credentials**: Your Aternos server IP and port (typically 25565 unless changed)
- **Authentication**: Microsoft/Mojang account for online-mode servers

## Key Features Added

### 1. Server Configuration Persistence
- **Save Servers**: Store server configurations for easy reuse across multiple bot deployments
- **API Endpoint**: `GET /api/servers` - Retrieve all saved servers
- **Save Endpoint**: `POST /api/servers/save` - Save a new server configuration

### 2. Authentication Modes
The system now automatically detects the server type and sets appropriate authentication:

- **Offline Mode** (LAN): For local/LAN servers without online-mode
- **Microsoft Auth** (Aternos): For online-mode servers requiring Microsoft authentication

### 3. Per-Bot Server Configuration
Each bot can now connect to different servers with different authentication settings, rather than being limited to the global settings.

## How to Deploy a Bot to Aternos

### Step 1: Start Your Mindcraft Server
```bash
npm start
```
This will start the MindServer on `http://localhost:8080`

### Step 2: Configure Your Bot
Navigate to the deployment page:
```
http://localhost:8080/deploy.html
```

Fill in the form:
- **Bot Name**: Choose a unique name (e.g., "AternosBot1")
- **Connection Type**: Select "IP Address"
- **Server IP Address**: Your Aternos server IP (e.g., `play.example.aternos.me`)
- **Server Port**: Your Aternos port (default: `25565`)
- **Server Name**: Give it a memorable name for saving (e.g., "My Aternos World")
- **Authentication Mode**: Select "Microsoft (Aternos)"
- **Initial Mode** (Optional): Set initial bot behavior (e.g., "farm", "mine", "survive")

### Step 3: Save the Server (Optional but Recommended)
Click the **💾 Save Server** button to store this server configuration for future bot deployments.

### Step 4: Deploy the Bot
Click the **Deploy Bot** button to connect the bot to your Aternos server.

The bot will now:
1. Authenticate with Microsoft if using Aternos
2. Connect as a real player
3. Appear in the `/list` command output
4. Show up in the player tab (if server is online-mode compatible)
5. Execute utility commands

## Authentication Details

### Microsoft Authentication (Aternos)
The system uses Mojang's Microsoft authentication protocol for online-mode servers:

**Required:**
- Valid Microsoft/Mojang account
- Account must be set to use the authenticated profile
- Server must have `online-mode=true` in server.properties

**How it works:**
- Bots authenticate using the account credentials you set in your Mindcraft configuration
- Authentication is handled by mineflayer's built-in Microsoft auth support
- Tokens are managed per-bot in the deployment settings

### Offline Mode (LAN)
For local or LAN servers without online-mode:

**Configuration:**
- Server must have `online-mode=false` in server.properties
- Select "Offline (LAN)" in the authentication mode dropdown
- Bots will connect with just their username (no auth required)

## Configuration Files

### Modified Files

#### 1. `src/mindcraft/mindserver.js`
- Added `savedServers` storage for server configurations
- New endpoint: `POST /api/servers/save` - Save server config
- New endpoint: `GET /api/servers` - Retrieve saved servers
- Updated `POST /api/deploy-bot` - Now accepts and uses per-bot auth mode

#### 2. `src/utils/mcdata.js`
- Modified `initBot(username, serverConfig)` - Now accepts optional serverConfig parameter
- Falls back to global settings if serverConfig not provided
- Logs connection details for debugging

#### 3. `src/agent/agent.js`
- Updated bot initialization to pass server configuration
- Creates serverConfig from current settings before calling initBot()

#### 4. `src/mindcraft/public/deploy.html`
- Added authentication mode selection (Offline/Microsoft)
- Added server save functionality with dedicated button
- Updated form submission to include authentication mode
- Added server management UI preparation

## API Endpoints

### POST /api/deploy-bot
Deploy a new bot to a server.

**Request:**
```json
{
  "botName": "AternosBot1",
  "serverIp": "play.example.aternos.me",
  "serverPort": 25565,
  "serverName": "My Aternos World",
  "authMode": "microsoft",
  "initialMode": "farm"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Bot 'AternosBot1' deployed successfully to play.example.aternos.me:25565"
}
```

### POST /api/servers/save
Save a server configuration for reuse.

**Request:**
```json
{
  "serverName": "My Aternos World",
  "serverIp": "play.example.aternos.me",
  "serverPort": 25565,
  "authMode": "microsoft"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Server 'My Aternos World' saved",
  "serverId": "play.example.aternos.me:25565"
}
```

### GET /api/servers
Retrieve all saved server configurations.

**Response:**
```json
{
  "servers": [
    {
      "name": "My Aternos World",
      "ip": "play.example.aternos.me",
      "port": 25565,
      "auth": "microsoft",
      "savedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### GET /api/bots
Retrieve all deployed bots and their status.

**Response:**
```json
{
  "bots": [
    {
      "name": "AternosBot1",
      "inGame": true,
      "host": "play.example.aternos.me",
      "port": 25565,
      "auth": "microsoft"
    }
  ]
}
```

## Troubleshooting

### Bot Won't Connect to Aternos

**Issue**: Bot shows "connection refused" or "connection timeout"

**Solutions:**
1. Verify Aternos server is running (check your Aternos dashboard)
2. Confirm correct IP and port in deployment form
3. Check that your account has `online-mode=true` servers
4. Try offline mode if issues persist with Microsoft auth

### Bot Doesn't Appear in Player List

**Issue**: Bot connects but doesn't show in `/list` or player tab

**Solutions:**
1. Verify authentication mode is set correctly:
   - Aternos (online-mode=true) → Use "Microsoft" auth
   - LAN servers (online-mode=false) → Use "Offline" auth
2. Check server logs for authentication errors
3. Restart the bot and try again

### "Cannot find module 'canvas.node'" Error

**Issue**: Server throws canvas module error on startup

**Solution**: This is a non-critical warning. The canvas module is optional for visualization. The server will still function normally.

### Multiple Bots on Same Server

**Issue**: Want to deploy multiple bots to the same Aternos server

**Solution:**
1. Save the server configuration once using the "Save Server" button
2. Deploy multiple bots with different names:
   - Change only the "Bot Name" field
   - Keep same Server IP, Port, and Auth Mode
   - Click "Deploy Bot" for each

## Best Practices

### 1. Server Configuration Management
- Save frequently-used servers to avoid re-entering details
- Use descriptive server names for easy identification
- Organize servers by purpose (e.g., "Aternos-Survival", "Aternos-Creative")

### 2. Bot Naming
- Use descriptive names that indicate purpose:
  - `AternosFarmer` for farming bots
  - `AternosMiner` for mining bots
  - `AternosGuard` for protection bots
- Include the number if deploying multiple: `AternosFarmer1`, `AternosFarmer2`

### 3. Authentication
- Always verify the correct auth mode before deployment:
  - **Aternos**: Always use "Microsoft (Aternos)"
  - **Local servers**: Use "Offline (LAN)"
  - **Public servers with online-mode**: Use "Microsoft"

### 4. Initial Setup
- Test with one bot first before deploying many
- Verify bot shows in player list before executing commands
- Monitor bot behavior in the server logs/chat

## Available Bot Commands

Once deployed, you can control bots with in-game commands:

### Basic Commands
- `!leave` - Disconnect bot from server
- `!inventory` - View bot's current inventory
- `!stats` - Display bot status and statistics

### Utility Commands
- `!mine <item> <quantity>` - Mine specified items
- `!collect <item> <quantity>` - Collect specified items
- `!farm <crop>` - Set up and manage farms
- `!fish` - Fish for items and food
- `!hunt <animal>` - Hunt animals for food

### Mode Commands
- `!speedrun` - Attempt to complete the game quickly
- `!survive` - Focus on survival and gathering
- `!pvp <player/all>` - Engage in combat
- `!protect <player/base>` - Protect players or bases
- `!buildEmpire` - Build a base with farms and gear

### Advanced Commands
- `!goToPlayer <name> <distance>` - Go to specific player
- `!searchForBlock <block> <range>` - Find and navigate to blocks
- `!craftRecipe <item> <quantity>` - Craft items
- `!attack <entity>` - Attack specific mob types
- `!trade <action>` - Trade with villagers

See [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) for complete command documentation.

## Advanced Configuration

### Custom Settings
For advanced users, you can modify per-bot settings by:

1. Creating a custom profile in `profiles/` directory
2. Setting specific auth tokens in configuration
3. Modifying deployment parameters via API directly

### Server Persistence
Server configurations are stored in memory during the current session. For persistent storage across restarts:

1. Implement file-based storage in `mindserver.js` (future feature)
2. Manually save server configurations to a backup file
3. Recreate saved servers after server restart

## Future Enhancements

Planned improvements to the deployment system:

- [ ] Persistent server storage to file/database
- [ ] Server edit/delete functionality in dashboard
- [ ] Bot management UI (start, stop, list commands)
- [ ] Advanced auth configuration (custom tokens)
- [ ] Bot logs and status monitoring
- [ ] Bulk bot deployment
- [ ] Auto-restart on disconnect

## Support

For issues or questions:

1. Check [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) for command documentation
2. Review error messages in MindServer console output
3. Check Aternos server logs for authentication errors
4. Verify all prerequisites are met

## Related Documentation

- [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) - Complete command reference
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick setup guide
- [README.md](README.md) - Project overview
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing procedures
