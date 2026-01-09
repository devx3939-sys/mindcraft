# Aternos Quick Start: Deploy Bots in 3 Steps

## ⚡ Quick Deployment

### Step 1: Start MindServer
```bash
npm start
```
Wait for: `MindServer running on port 8080`

### Step 2: Open Deployment Page
Open in your browser:
```
http://localhost:8080/deploy.html
```

### Step 3: Configure and Deploy

Fill in these fields:
```
Bot Name:              AternosBot1
Connection Type:       IP Address
Server IP:             play.example.aternos.me  (your Aternos IP)
Server Port:           25565  (or your custom port)
Server Name:           My Aternos World  (for saving)
Authentication Mode:   ✓ Microsoft (Aternos)  ← IMPORTANT!
Initial Mode:          farm  (optional)
```

Click **Deploy Bot** → Bot joins your server!

## ✓ Verify Bot Connected

In-game, check bot is listed:
```
/list
```

You should see your bot name in the player list.

## 💾 Save Server (Reuse Next Time)

Click **💾 Save Server** button to save configuration.

Next deployment: Just change bot name and click Deploy!

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Connection timeout | Verify Aternos server is running |
| Bot doesn't appear in /list | Use "Microsoft (Aternos)" auth mode |
| "Cannot find module canvas" | Ignore - optional visualization module |
| Bot won't authenticate | Verify your Aternos has online-mode enabled |

## 📋 Available Bot Commands

Once connected, use in-game chat:

```
!mine <item> <qty>      - Mine resources
!farm <crop>            - Set up farms
!fish                   - Fish for food
!hunt <animal>          - Hunt animals
!survive                - Survival mode
!speedrun               - Speed run mode
!pvp <player>           - Combat mode
!buildEmpire            - Build base
!leave                  - Disconnect bot
```

See [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) for all commands.

## 🎯 Multi-Bot Deployment

Deploy multiple bots to same server:

1. Save server config once
2. Change bot name → Deploy
3. Change bot name → Deploy
4. Repeat for each bot

All will connect to the same server!

## ✨ What's New

- ✅ Per-bot server configuration (not global)
- ✅ Automatic Microsoft auth detection for Aternos
- ✅ Server configuration save/reuse
- ✅ Proper online-mode support
- ✅ Bots show in player list

## 📖 Full Documentation

For detailed information, see:
- [ATERNOS_DEPLOYMENT_GUIDE.md](ATERNOS_DEPLOYMENT_GUIDE.md) - Complete guide
- [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) - Command reference
- [README.md](README.md) - Project overview
