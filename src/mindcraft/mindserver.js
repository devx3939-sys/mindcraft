import { Server } from 'socket.io';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mindcraft from './mindcraft.js';
import fs, { readFileSync } from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mindserver is:
// - central hub for communication between all agent processes
// - api to control from other languages and remote users 
// - host for webapp

let io;
let server;
const agent_connections = {};
const agent_listeners = [];
const savedServers = {}; // Store server configurations for reuse
const path_to_saved = path.join(__dirname, '..', '..', 'data', 'saved_servers.json');

const settings_spec = JSON.parse(readFileSync(path.join(__dirname, 'public/settings_spec.json'), 'utf8'));

// Load saved servers from disk on startup if present
try {
    const savedRaw = readFileSync(path_to_saved, 'utf8');
    const parsedServers = JSON.parse(savedRaw);
    for (let key in parsedServers) savedServers[key] = parsedServers[key];
    console.log('Loaded saved servers from disk:', Object.keys(savedServers).length);
} catch (err) {
    // No saved file yet; that's fine
    console.log('No saved servers file found; starting with empty list.');
} 

class AgentConnection {
    constructor(settings, viewer_port) {
        this.socket = null;
        this.settings = settings;
        this.in_game = false;
        this.full_state = null;
        this.viewer_port = viewer_port;
    }
    setSettings(settings) {
        this.settings = settings;
    }
}

export function registerAgent(settings, viewer_port) {
    let agentConnection = new AgentConnection(settings, viewer_port);
    agent_connections[settings.profile.name] = agentConnection;
}

export function logoutAgent(agentName) {
    if (agent_connections[agentName]) {
        agent_connections[agentName].in_game = false;
        agentsStatusUpdate();
    }
}

// Initialize the server
export function createMindServer(host_public = false, port = 8080) {
    const app = express();
    server = http.createServer(app);
    io = new Server(server);

    // Serve static files
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());

    // API Endpoint to save a server configuration
    app.post('/api/servers/save', (req, res) => {
        try {
            const { serverName, serverIp, serverPort, authMode } = req.body;

            if (!serverName || !serverIp || !serverPort) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: serverName, serverIp, serverPort'
                });
            }

            const serverId = `${serverIp}:${serverPort}`;
            savedServers[serverId] = {
                id: serverId,
                name: serverName,
                ip: serverIp,
                port: serverPort,
                auth: authMode || 'offline',
                savedAt: new Date().toISOString()
            };

            // Persist to disk immediately
            try {
                const dir = path.dirname(path_to_saved);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2));
            } catch (err) {
                console.error('Error writing saved servers file:', err);
            }

            res.json({
                success: true,
                message: `Server '${serverName}' saved`,
                serverId
            });
        } catch (error) {
            console.error('Server save error:', error);
            res.status(500).json({
                success: false,
                message: `Error saving server: ${error.message}`
            });
        }
    });

    // API Endpoint to get saved servers
    app.get('/api/servers', (req, res) => {
        res.json({
            servers: Object.values(savedServers)
        });
    });

    // API Endpoint to delete a saved server
    app.delete('/api/servers/:serverId', (req, res) => {
        const { serverId } = req.params;
        if (savedServers[serverId]) {
            delete savedServers[serverId];
            try {
                const dir = path.dirname(path_to_saved);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2));
            } catch (err) {
                console.error('Error writing saved servers file:', err);
            }
            return res.json({ success: true, message: 'Server deleted' });
        }
        res.status(404).json({ success: false, message: 'Server not found' });
    });

    // --- Microsoft Device Flow Integration ---
    // Start a device-code flow and return the user_code and verification URI to the UI
    app.post('/api/servers/:serverId/auth/start', async (req, res) => {
        try {
            const { serverId } = req.params;
            // Use well-known Minecraft client_id
            const clientId = '00000000402b5328';
            const scope = 'XboxLive.signin offline_access';

            const body = new URLSearchParams();
            body.append('client_id', clientId);
            body.append('scope', scope);

            const resp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            if (!resp.ok) {
                const errText = await resp.text();
                console.error('Device code start failed:', errText);
                return res.status(500).json({ success: false, message: 'Failed to start device flow' });
            }

            const data = await resp.json();

            // Keep device info in temporary object on the saved server entry so we can poll later
            if (!savedServers[serverId]) {
                return res.status(404).json({ success: false, message: 'Saved server not found' });
            }

            savedServers[serverId]._deviceFlow = {
                device_code: data.device_code,
                user_code: data.user_code,
                verification_uri: data.verification_uri || data.verification_uri_complete,
                expires_at: Date.now() + (parseInt(data.expires_in || 900) * 1000),
                interval: parseInt(data.interval || 5)
            };

            // Persist the temporary device info (so restarts keep it)
            try {
                fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2));
            } catch (err) {
                console.warn('Could not persist device flow info:', err);
            }

            res.json({
                success: true,
                user_code: data.user_code,
                verification_uri: data.verification_uri || data.verification_uri_complete,
                expires_in: data.expires_in,
                interval: data.interval
            });
        } catch (err) {
            console.error('Auth start error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Poll for device token and exchange to a Minecraft access token; saves to the saved server entry when successful
    app.post('/api/servers/:serverId/auth/poll', async (req, res) => {
        try {
            const { serverId } = req.params;
            const server = savedServers[serverId];
            if (!server || !server._deviceFlow) return res.status(404).json({ success: false, message: 'No device flow in progress for this server' });

            const device = server._deviceFlow;
            if (Date.now() > device.expires_at) {
                delete server._deviceFlow;
                try { fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2)); } catch (err) {}
                return res.status(400).json({ success: false, message: 'Device code expired' });
            }

            const clientId = '00000000402b5328';
            const body = new URLSearchParams();
            body.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');
            body.append('client_id', clientId);
            body.append('device_code', device.device_code);

            const tokenResp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            const tokenData = await tokenResp.json();

            if (tokenData.error) {
                // authorization_pending and other statuses are expected
                if (tokenData.error === 'authorization_pending') {
                    return res.status(202).json({ success: false, message: 'authorization_pending' });
                }
                if (tokenData.error === 'authorization_declined') {
                    delete server._deviceFlow;
                    try { fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2)); } catch (err) {}
                    return res.status(400).json({ success: false, message: 'authorization_declined' });
                }
                if (tokenData.error === 'expired_token') {
                    delete server._deviceFlow;
                    try { fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2)); } catch (err) {}
                    return res.status(400).json({ success: false, message: 'expired_token' });
                }

                console.warn('Unexpected token response', tokenData);
                return res.status(400).json({ success: false, message: tokenData.error_description || 'Unknown token error' });
            }

            // We now have a Microsoft access token (tokenData.access_token) and refresh_token
            const msAccessToken = tokenData.access_token;
            const msRefreshToken = tokenData.refresh_token;

            // Exchange Microsoft token for Xbox Live token
            const xboxResp = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${msAccessToken}`
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT'
                })
            });

            if (!xboxResp.ok) {
                const txt = await xboxResp.text();
                console.error('Xbox auth failed', txt);
                return res.status(500).json({ success: false, message: 'Xbox auth failed' });
            }

            const xboxData = await xboxResp.json();
            const xblToken = xboxData.Token;
            const uhs = xboxData.DisplayClaims?.xui?.[0]?.uhs;

            // Exchange XBL token for XSTS
            const xstsResp = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xblToken]
                    },
                    RelyingParty: 'rp://api.minecraftservices.com/',
                    TokenType: 'JWT'
                })
            });

            if (!xstsResp.ok) {
                const txt = await xstsResp.text();
                console.error('XSTS auth failed', txt);
                return res.status(500).json({ success: false, message: 'XSTS auth failed' });
            }

            const xstsData = await xstsResp.json();
            const xstsToken = xstsData?.Token;

            // Exchange XSTS + uhs for Minecraft access token
            const mcResp = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identityToken: `XBL3.0 x=${uhs};${xstsToken}`
                })
            });

            if (!mcResp.ok) {
                const txt = await mcResp.text();
                console.error('Minecraft login failed', txt);
                return res.status(500).json({ success: false, message: 'Minecraft auth failed' });
            }

            const mcData = await mcResp.json();
            const mcAccessToken = mcData.access_token;

            // Fetch profile to get username and uuid
            const profileResp = await fetch('https://api.minecraftservices.com/minecraft/profile', {
                headers: { 'Authorization': `Bearer ${mcAccessToken}` }
            });

            if (!profileResp.ok) {
                const txt = await profileResp.text();
                console.error('Minecraft profile failed', txt);
                return res.status(500).json({ success: false, message: 'Minecraft profile fetch failed' });
            }

            const profile = await profileResp.json();

            // Save tokens and profile in saved server entry
            server.authToken = mcAccessToken;
            server.authProfile = { id: profile.id, name: profile.name };
            server.msRefreshToken = msRefreshToken; // for refresh later if needed
            delete server._deviceFlow;

            // Persist to disk
            try {
                fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2));
            } catch (err) {
                console.error('Error persisting saved server after auth', err);
            }

            res.json({ success: true, message: 'Authenticated', profile });
        } catch (err) {
            console.error('Auth poll error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // Optional: Refresh Microsoft token for server (not fully automated yet)
    app.post('/api/servers/:serverId/auth/refresh', async (req, res) => {
        try {
            const { serverId } = req.params;
            const server = savedServers[serverId];
            if (!server || !server.msRefreshToken) return res.status(404).json({ success: false, message: 'No refresh token available for this server' });

            const body = new URLSearchParams();
            body.append('client_id', '00000000402b5328');
            body.append('grant_type', 'refresh_token');
            body.append('scope', 'XboxLive.signin offline_access');
            body.append('refresh_token', server.msRefreshToken);

            const tokenResp = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString()
            });

            const tokenData = await tokenResp.json();
            if (tokenData.error) return res.status(400).json({ success: false, message: tokenData.error_description || tokenData.error });

            // Replace stored tokens (we won't re-run full xbox flow here; to keep simple we will ask user to re-run auth if problems occur)
            server.msRefreshToken = tokenData.refresh_token || server.msRefreshToken;
            try { fs.writeFileSync(path_to_saved, JSON.stringify(savedServers, null, 2)); } catch (err) {}

            res.json({ success: true, message: 'Refresh token stored' });
        } catch (err) {
            console.error('Auth refresh error:', err);
            res.status(500).json({ success: false, message: err.message });
        }
    });

    // --- End Microsoft device flow integration ---

    // API Endpoint for bot deployment
    app.post('/api/deploy-bot', async (req, res) => {
        try {
            const { botName, serverIp, serverPort, serverName, initialMode, authMode } = req.body;

            // Validate inputs
            if (!botName || !serverIp || !serverPort) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Missing required fields: botName, serverIp, serverPort' 
                });
            }

            // Determine auth method - detect based on server
            let auth = authMode || 'offline';
            
            // If it's an Aternos server or explicitly set, use microsoft auth
            if (serverIp.includes('aternos') || authMode === 'microsoft') {
                auth = 'microsoft';
                console.log(`Detected Aternos server or microsoft auth mode requested for ${botName}`);
            }

            // Create a profile for the bot
            const botProfile = {
                name: botName,
                host: serverIp,
                port: parseInt(serverPort),
                auth: auth
            };

            // Create agent settings with proper server config
            const settings = {
                profile: botProfile,
                host: serverIp,
                port: parseInt(serverPort),
                minecraft_version: 'auto',
                auth: auth,
                authToken: req.body.authToken || null,
                chat_ingame: true,
                allow_insecure_coding: false,
                base_profile: 'assistant',
                server_name: serverName || 'Default'
            };

            // If authToken not provided but a saved server exists with token, use it
            try {
                const serverId = `${serverIp}:${serverPort}`;
                if ((!settings.authToken || settings.authToken === '') && savedServers[serverId] && savedServers[serverId].authToken) {
                    settings.authToken = savedServers[serverId].authToken;
                    if (savedServers[serverId].authProfile) settings.profile.authProfile = savedServers[serverId].authProfile;
                    console.log(`Using saved auth token from saved server ${serverId} for bot ${botName}`);
                }
            } catch (err) {
                // ignore
            }

            console.log(`Deploying bot '${botName}' to ${serverIp}:${serverPort} with auth mode: ${auth}`);

            // Register and start the agent
            const result = await mindcraft.createAgent(settings);

            if (result.success) {
                res.json({ 
                    success: true, 
                    message: `Bot '${botName}' deployed successfully to ${serverIp}:${serverPort}` 
                });
            } else {
                res.status(400).json({ 
                    success: false, 
                    message: result.error || 'Failed to create agent' 
                });
            }
        } catch (error) {
            console.error('Deployment error:', error);
            res.status(500).json({ 
                success: false, 
                message: `Deployment error: ${error.message}` 
            });
        }
    });

    // API Endpoint to get deployed bots
    app.get('/api/bots', (req, res) => {
        const bots = [];
        for (let botName in agent_connections) {
            const conn = agent_connections[botName];
            bots.push({
                name: botName,
                inGame: conn.in_game,
                host: conn.settings?.host,
                port: conn.settings?.port,
                auth: conn.settings?.auth,
                settings: conn.settings
            });
        }
        res.json({ bots });
    });

    // API Endpoint to forward a command to a particular agent (used by LLM bridges / UI)
    app.post('/api/agents/:agentName/command', (req, res) => {
        const { agentName } = req.params;
        const cmd = req.body;
        if (!agent_connections[agentName] || !agent_connections[agentName].socket) {
            return res.status(404).json({ success: false, message: 'Agent not found or not connected' });
        }
        try {
            // Send the command to the agent process and wait for its callback
            agent_connections[agentName].socket.emit('execute-command', cmd, (ack) => {
                res.json({ success: true, ack });
            });
        } catch (err) {
            console.error('Error forwarding command to agent:', err);
            res.status(500).json({ success: false, message: String(err) });
        }
    });

    // Socket.io connection handling
    io.on('connection', (socket) => {
        let curAgentName = null;
        console.log('Client connected');

        agentsStatusUpdate(socket);

        socket.on('create-agent', async (settings, callback) => {
            console.log('API create agent...');
            for (let key in settings_spec) {
                if (!(key in settings)) {
                    if (settings_spec[key].required) {
                        callback({ success: false, error: `Setting ${key} is required` });
                        return;
                    }
                    else {
                        settings[key] = settings_spec[key].default;
                    }
                }
            }
            for (let key in settings) {
                if (!(key in settings_spec)) {
                    delete settings[key];
                }
            }
            if (settings.profile?.name) {
                if (settings.profile.name in agent_connections) {
                    callback({ success: false, error: 'Agent already exists' });
                    return;
                }
                let returned = await mindcraft.createAgent(settings);
                callback({ success: returned.success, error: returned.error });
                let name = settings.profile.name;
                if (!returned.success && agent_connections[name]) {
                    mindcraft.destroyAgent(name);
                    delete agent_connections[name];
                }
                agentsStatusUpdate();
            }
            else {
                console.error('Agent name is required in profile');
                callback({ success: false, error: 'Agent name is required in profile' });
            }
        });

        socket.on('get-settings', (agentName, callback) => {
            if (agent_connections[agentName]) {
                callback({ settings: agent_connections[agentName].settings });
            } else {
                callback({ error: `Agent '${agentName}' not found.` });
            }
        });

        socket.on('connect-agent-process', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agentsStatusUpdate();
            }
        });

        socket.on('login-agent', (agentName) => {
            if (agent_connections[agentName]) {
                agent_connections[agentName].socket = socket;
                agent_connections[agentName].in_game = true;
                curAgentName = agentName;
                agentsStatusUpdate();
            }
            else {
                console.warn(`Unregistered agent ${agentName} tried to login`);
            }
        });

        socket.on('disconnect', () => {
            if (agent_connections[curAgentName]) {
                console.log(`Agent ${curAgentName} disconnected`);
                agent_connections[curAgentName].in_game = false;
                agent_connections[curAgentName].socket = null;
                agentsStatusUpdate();
            }
            if (agent_listeners.includes(socket)) {
                removeListener(socket);
            }
        });

        socket.on('chat-message', (agentName, json) => {
            if (!agent_connections[agentName]) {
                console.warn(`Agent ${agentName} tried to send a message but is not logged in`);
                return;
            }
            console.log(`${curAgentName} sending message to ${agentName}: ${json.message}`);
            agent_connections[agentName].socket.emit('chat-message', curAgentName, json);
        });

        socket.on('set-agent-settings', (agentName, settings) => {
            const agent = agent_connections[agentName];
            if (agent) {
                agent.setSettings(settings);
                agent.socket.emit('restart-agent');
            }
        });

        socket.on('restart-agent', (agentName) => {
            console.log(`Restarting agent: ${agentName}`);
            agent_connections[agentName].socket.emit('restart-agent');
        });

        socket.on('stop-agent', (agentName) => {
            mindcraft.stopAgent(agentName);
        });

        socket.on('start-agent', (agentName) => {
            mindcraft.startAgent(agentName);
        });

        socket.on('destroy-agent', (agentName) => {
            if (agent_connections[agentName]) {
                mindcraft.destroyAgent(agentName);
                delete agent_connections[agentName];
            }
            agentsStatusUpdate();
        });

        socket.on('stop-all-agents', () => {
            console.log('Killing all agents');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
        });

        socket.on('shutdown', () => {
            console.log('Shutting down');
            for (let agentName in agent_connections) {
                mindcraft.stopAgent(agentName);
            }
            // wait 2 seconds
            setTimeout(() => {
                console.log('Exiting MindServer');
                process.exit(0);
            }, 2000);
            
        });

		socket.on('send-message', (agentName, data) => {
			if (!agent_connections[agentName]) {
				console.warn(`Agent ${agentName} not in game, cannot send message via MindServer.`);
				return
			}
			try {
				agent_connections[agentName].socket.emit('send-message', data)
			} catch (error) {
				console.error('Error: ', error);
			}
		});

        socket.on('bot-output', (agentName, message) => {
            io.emit('bot-output', agentName, message);
        });

        // Forward command results from agents to all listeners/UI
        socket.on('command-result', (agentName, commandId, result) => {
            io.emit('command-result', agentName, commandId, result);
        });

        socket.on('listen-to-agents', () => {
            addListener(socket);
        });
    });

    let host = host_public ? '0.0.0.0' : 'localhost';
    server.listen(port, host, () => {
        console.log(`MindServer running on port ${port}`);
    });

    return server;
}

function agentsStatusUpdate(socket) {
    if (!socket) {
        socket = io;
    }
    let agents = [];
    for (let agentName in agent_connections) {
        const conn = agent_connections[agentName];
        agents.push({
            name: agentName, 
            in_game: conn.in_game,
            viewerPort: conn.viewer_port,
            socket_connected: !!conn.socket
        });
    };
    socket.emit('agents-status', agents);
}


let listenerInterval = null;
function addListener(listener_socket) {
    agent_listeners.push(listener_socket);
    if (agent_listeners.length === 1) {
        listenerInterval = setInterval(async () => {
            const states = {};
            for (let agentName in agent_connections) {
                let agent = agent_connections[agentName];
                if (agent.in_game) {
                    try {
                        const state = await new Promise((resolve) => {
                            agent.socket.emit('get-full-state', (s) => resolve(s));
                        });
                        states[agentName] = state;
                    } catch (e) {
                        states[agentName] = { error: String(e) };
                    }
                }
            }
            for (let listener of agent_listeners) {
                listener.emit('state-update', states);
            }
        }, 1000);
    }
}

function removeListener(listener_socket) {
    agent_listeners.splice(agent_listeners.indexOf(listener_socket), 1);
    if (agent_listeners.length === 0) {
        clearInterval(listenerInterval);
        listenerInterval = null;
    }
}

// Optional: export these if you need access to them from other files
export const getIO = () => io;
export const getServer = () => server;
export const numStateListeners = () => agent_listeners.length;