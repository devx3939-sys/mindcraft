# Testing Guide

This document has been merged into [MERGED_FULL.md](MERGED_FULL.md). Please open that file for the consolidated documentation.

## ✅ Phase 1: Setup & Deployment

### 1.1 Start Mindcraft
- [ ] Run `npm start` in mindcraft directory
- [ ] Wait for "MindServer running on port 8080" message
- [ ] Dashboard opens at http://localhost:8080

### 1.2 Verify Dashboard Button
- [ ] Dashboard displays "Deploy Utility Bot" button
- [ ] Button is visible and clickable
- [ ] Button has proper styling

### 1.3 Access Deployment Page
- [ ] Click "Deploy Utility Bot" button
- [ ] Page loads at http://localhost:8080/deploy.html
- [ ] Form displays with all fields
- [ ] UI has gradient background and animations

### 1.4 Verify Form Fields
- [ ] Bot Name field is present and required
- [ ] Connection Type radio buttons work
- [ ] Server IP field shows/hides based on connection type
- [ ] Server Port field has default value (55916)
- [ ] Server Name field is optional
- [ ] Initial Mode field is optional
- [ ] Deploy and Reset buttons are functional

## ✅ Phase 2: Deployment Testing

### 2.1 Deploy with Localhost
- [ ] Select Localhost connection type
- [ ] Enter bot name: "TestBot"
- [ ] Leave server IP as 127.0.0.1
- [ ] Enter port (must match your server)
- [ ] Click Deploy
- [ ] See success message if server is running
- [ ] Bot appears in dashboard

### 2.2 Deploy with Custom IP
- [ ] Select "IP Address" connection type
- [ ] Server IP field appears
- [ ] Enter custom IP address
- [ ] Enter port
- [ ] Click Deploy
- [ ] Verify deployment succeeds or shows appropriate error

### 2.3 Error Handling
- [ ] Try deploying with invalid port (e.g., 99999)
- [ ] Try deploying with no bot name
- [ ] See appropriate error messages
- [ ] Messages are helpful and clear

### 2.4 Verify Bot in Dashboard
- [ ] New bot appears in agents list
- [ ] Bot shows as "Online" or appropriate status
- [ ] Bot can be selected and managed

## ✅ Phase 3: Command Testing

### 3.1 Basic Commands
- [ ] Send `!inventory` - shows inventory
- [ ] Send `!stats` - shows health, food, position
- [ ] Commands execute without errors
- [ ] Bot responds with messages

### 3.2 Mining Commands
- [ ] Send `!mine("stone", 10)` - bot mines stone
- [ ] Send `!collect("oak_log", 10)` - bot collects wood
- [ ] Bot navigates and mines specified blocks
- [ ] Output shows progress

### 3.3 Navigation Commands
- [ ] Send `!searchForBlock("iron_ore", 128)` - bot searches
- [ ] Send `!moveAway(10)` - bot moves away
- [ ] Bot successfully navigates
- [ ] Distance/location updates in stats

### 3.4 Survival Commands
- [ ] Send `!survive` - bot enters survival mode
- [ ] Bot seeks resources and food
- [ ] Send `!sleep` - bot finds bed and sleeps
- [ ] Send `!heal` - bot eats food if available

### 3.5 Complex Commands
- [ ] Send `!farm("wheat")` - bot sets up farm
- [ ] Send `!buildEmpire` - bot builds base (takes time)
- [ ] Send `!speedrun` - bot attempts to beat game
- [ ] Commands execute with proper logging

### 3.6 Inventory Management
- [ ] Send `!collect("stone", 32)` - collect blocks
- [ ] Send `!putInChest("stone", 16)` - store in chest
- [ ] Send `!takeFromChest("stone", 8)` - retrieve from chest
- [ ] Send `!equip("diamond_pickaxe")` - equip item
- [ ] All commands work as expected

### 3.7 Crafting Commands
- [ ] Send `!craftRecipe("sticks", 1)` - craft sticks
- [ ] Send `!craftRecipe("crafting_table", 1)` - craft table
- [ ] Send `!smeltItem("iron_ore", 8)` - smelt ore
- [ ] Send `!clearFurnace` - empty furnace
- [ ] Commands execute successfully

### 3.8 Trading Commands
- [ ] Send `!trade("find")` - bot finds villagers
- [ ] Send `!trade("show 1")` - shows villager trades (use real ID)
- [ ] Send `!trade("execute 1 1 1")` - execute trade (if possible)
- [ ] Commands handle villager interactions

## ✅ Phase 4: Error Handling

### 4.1 Invalid Commands
- [ ] Send invalid command name: `!invalidcommand()`
- [ ] See error: "command not found"
- [ ] Bot doesn't crash

### 4.2 Missing Parameters
- [ ] Send `!mine()` without parameters
- [ ] See error about wrong number of args
- [ ] Bot handles gracefully

### 4.3 Wrong Parameter Types
- [ ] Send `!mine("stone", "invalid")`
- [ ] See error about parameter type
- [ ] Bot handles gracefully

### 4.4 Unreachable Blocks
- [ ] Send `!mine("stone", 1000000)`
- [ ] Bot attempts to find stones
- [ ] Shows message if can't find enough
- [ ] No crash or hang

## ✅ Phase 5: Performance Testing

### 5.1 Single Bot
- [ ] Deploy one bot
- [ ] Monitor memory usage (should be ~2MB)
- [ ] Send continuous commands
- [ ] No memory leaks detected
- [ ] Bot remains responsive

### 5.2 Multiple Bots
- [ ] Deploy 3-5 bots
- [ ] Send different commands to each
- [ ] All bots execute independently
- [ ] Dashboard shows all bots
- [ ] System remains responsive

### 5.3 Long Running Commands
- [ ] Send `!buildEmpire` (takes ~8 hours simulated)
- [ ] Can send other commands while running
- [ ] Dashboard remains responsive
- [ ] Bot can be stopped with `!stop`

## ✅ Phase 6: API Testing

### 6.1 Deploy Bot via API
```bash
curl -X POST http://localhost:8080/api/deploy-bot \
  -H "Content-Type: application/json" \
  -d '{
    "botName": "APIBot",
    "serverIp": "127.0.0.1",
    "serverPort": 25565,
    "serverName": "TestWorld",
    "initialMode": "survive"
  }'
```
- [ ] Returns success response
- [ ] Bot appears in dashboard

### 6.2 Get Bots List
```bash
curl http://localhost:8080/api/bots
```
- [ ] Returns JSON with bot list
- [ ] Shows all deployed bots
- [ ] Shows bot status

## ✅ Phase 7: UI Testing

### 7.1 Deployment Form
- [ ] Form looks good on desktop
- [ ] Form looks good on tablet
- [ ] Form looks good on mobile
- [ ] All inputs are accessible

### 7.2 Button Styling
- [ ] Deploy button changes color on hover
- [ ] Deploy button disables when loading
- [ ] Reset button works
- [ ] Buttons are properly sized

### 7.3 Status Messages
- [ ] Success message appears with checkmark
- [ ] Error message appears with X
- [ ] Loading spinner animates
- [ ] Messages disappear appropriately

### 7.4 Command Reference
- [ ] Command list displays in UI
- [ ] All commands are listed
- [ ] Descriptions are clear
- [ ] Examples are accurate

## ✅ Phase 8: Documentation

### 8.1 Verify Documentation Files Exist
- [ ] UTILITY_BOT_GUIDE.md exists
- [ ] QUICK_REFERENCE.md exists
- [ ] UTILITY_BOT_README.md exists
- [ ] IMPLEMENTATION_SUMMARY.md exists
- [ ] DELIVERY_SUMMARY.md exists

### 8.2 Check Documentation Quality
- [ ] Guides are readable
- [ ] Commands are documented
- [ ] Examples are provided
- [ ] Syntax is correct

## 📝 Test Results Template

Use this template to document test results:

```markdown
## Test Results - [Date]

### Phase 1: Setup & Deployment
- [ ] 1.1 Start Mindcraft - PASS/FAIL
- [ ] 1.2 Verify Dashboard Button - PASS/FAIL
- [ ] 1.3 Access Deployment Page - PASS/FAIL
- [ ] 1.4 Verify Form Fields - PASS/FAIL

### Phase 2: Deployment Testing
- [ ] 2.1 Deploy with Localhost - PASS/FAIL
- [ ] 2.2 Deploy with Custom IP - PASS/FAIL
- [ ] 2.3 Error Handling - PASS/FAIL
- [ ] 2.4 Verify Bot in Dashboard - PASS/FAIL

### Phase 3: Command Testing
- [ ] 3.1 Basic Commands - PASS/FAIL
- [ ] 3.2 Mining Commands - PASS/FAIL
- [ ] 3.3 Navigation Commands - PASS/FAIL
- [ ] 3.4 Survival Commands - PASS/FAIL
- [ ] 3.5 Complex Commands - PASS/FAIL
- [ ] 3.6 Inventory Management - PASS/FAIL
- [ ] 3.7 Crafting Commands - PASS/FAIL
- [ ] 3.8 Trading Commands - PASS/FAIL

### Phase 4: Error Handling
- [ ] 4.1 Invalid Commands - PASS/FAIL
- [ ] 4.2 Missing Parameters - PASS/FAIL
- [ ] 4.3 Wrong Parameter Types - PASS/FAIL
- [ ] 4.4 Unreachable Blocks - PASS/FAIL

### Phase 5: Performance Testing
- [ ] 5.1 Single Bot - PASS/FAIL
- [ ] 5.2 Multiple Bots - PASS/FAIL
- [ ] 5.3 Long Running Commands - PASS/FAIL

### Phase 6: API Testing
- [ ] 6.1 Deploy Bot via API - PASS/FAIL
- [ ] 6.2 Get Bots List - PASS/FAIL

### Phase 7: UI Testing
- [ ] 7.1 Deployment Form - PASS/FAIL
- [ ] 7.2 Button Styling - PASS/FAIL
- [ ] 7.3 Status Messages - PASS/FAIL
- [ ] 7.4 Command Reference - PASS/FAIL

### Phase 8: Documentation
- [ ] 8.1 Documentation Files - PASS/FAIL
- [ ] 8.2 Documentation Quality - PASS/FAIL

## Summary
- Total Tests: [X]
- Passed: [X]
- Failed: [X]
- Success Rate: [X%]

## Issues Found
(List any bugs or issues discovered)

## Notes
(Any additional observations or recommendations)
```

## Quick Test (5 minutes)

If you want to quickly test the main functionality:

1. Start Mindcraft
2. Click "Deploy Utility Bot"
3. Deploy a bot to localhost
4. Send `!stats` command
5. See bot health/position output
6. Send `!mine("stone", 5)`
7. Watch bot mine stone
8. Send `!inventory`
9. See inventory contents
10. ✓ All working!

## Known Limitations

- Villager trading requires finding villagers first
- Building Empire takes simulated time
- Some commands require specific world conditions
- Game commands execute in order, some may take time

## Support

If a test fails:
1. Check error messages in bot output
2. Verify server is running and accessible
3. Check command syntax matches examples
4. Review UTILITY_BOT_GUIDE.md for details
5. Check connection type matches your server

---

**All tests passing? You're ready to use the Utility Bot System!** 🎉
