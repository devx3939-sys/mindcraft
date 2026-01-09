# Documentation Merged

This document has been merged into [MERGED_FULL.md](MERGED_FULL.md). Please open that file for the full consolidated documentation.
For programmatic deployment:

```bash
curl -X POST http://localhost:8080/api/deploy-bot \
  -H "Content-Type: application/json" \
  -d '{
    "botName": "MinerBot",
    "serverIp": "127.0.0.1",
    "serverPort": 25565,
    "serverName": "MyWorld",
    "initialMode": "survive"
  }'
```

## Troubleshooting

**Bot won't connect?**
- Ensure your Minecraft server is running
- Check the IP address and port are correct
- Try localhost or 127.0.0.1 for local servers

**Command not working?**
- Check the syntax (use `!` prefix)
- Verify bot is in-game (green indicator in dashboard)
- Review examples in QUICK_REFERENCE.md

**Server not found?**
- Verify IP address and port number
- Ensure server firewall allows connections
- Check server logs for connection errors

## Advanced Usage

### Chaining Commands
Send commands one after another to create workflows:

1. `!survive` - Get resources
2. `!mine("diamond_ore", 6)` - Mine diamonds  
3. `!craft Recipe("diamond_pickaxe", 1)` - Make pickaxe
4. `!equip("diamond_pickaxe")` - Equip it

### Protecting Bases
```
!protect("base")      # Defend your base location
!protect("PlayerName") # Defend a specific player
```

### Farming Operation
```
!farm("wheat")    # Plant wheat
!farm("carrots")  # Plant carrots
!farm("potatoes") # Plant potatoes
```

## What Can Bots Do?

✓ Mine and collect blocks
✓ Craft and smelt items
✓ Build structures
✓ Farm crops
✓ Hunt animals
✓ Fish
✓ Trade with villagers
✓ Fight mobs and players
✓ Protect locations
✓ Navigate the world
✓ Manage inventory
✓ Survive in the world
✓ Beat the game (speedrun mode!)

## Performance

Each bot uses:
- **Memory**: ~2MB idle, ~5-10MB active
- **CPU**: <5% during idle, varies with commands
- **Network**: Minimal, command-based communication

You can deploy multiple bots - they run independently!

## FAQ

**Q: Do I need an LLM key?**
A: No! These are simple utility bots that don't require AI.

**Q: How many bots can I deploy?**
A: As many as you want - limited only by your system resources.

**Q: Can I customize commands?**
A: Yes! Edit src/agent/commands/actions.js to add your own.

**Q: Will this work on my Minecraft server?**
A: Yes, as long as it's vanilla or compatible (Paper, Spigot, Fabric).

**Q: Can bots use admin commands?**
A: Bots run as regular players - no /op access needed.

**Q: Is this safe?**
A: Yes! Bots only execute predefined commands in the game world.

## Next Steps

1. Read [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md) for complete documentation
2. Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for command cheat sheet
3. Deploy your first bot!
4. Try different commands
5. Create amazing automated worlds

## Support & Feedback

For issues or suggestions:
1. Check the Troubleshooting section above
2. Review [UTILITY_BOT_GUIDE.md](UTILITY_BOT_GUIDE.md)
3. Check command syntax in [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

---

**Ready to automate? Click "Deploy Utility Bot" in the dashboard to get started!** 🚀
