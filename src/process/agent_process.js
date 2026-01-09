import { spawn } from 'child_process';
import { logoutAgent } from '../mindcraft/mindserver.js';

export class AgentProcess {
    constructor(name, port, settings = {}) {
        this.name = name;
        this.port = port;
        this.settings = settings; // includes host, port, auth, authToken, profile
    }

    start(load_memory=false, init_message=null, count_id=0) {
        this.count_id = count_id;
        this.running = true;

        // We spawn a simplified mineflayer client that connects directly to the target server
        // This improves reliability for joining online servers (Microsoft auth) while keeping the rest
        // of the agent system intact. Later this can be toggled per-profile.
        const args = [
            'src/process/simple_bot.js',
            '--name', this.name,
            '--host', String(this.settings?.profile?.host || this.settings?.host || 'localhost'),
            '--port', String(this.settings?.profile?.port || this.settings?.port || 25565),
            '--username', this.name,
            '--mindserver', String(this.port)
        ];

        if (this.settings) {
            if (this.settings.auth) args.push('--authMode', this.settings.auth);
            if (this.settings.authToken) args.push('--authToken', this.settings.authToken);
            if (this.settings.authProfile) args.push('--authProfile', JSON.stringify(this.settings.authProfile));
            if (this.settings.minecraft_version) args.push('--version', this.settings.minecraft_version);
        }

        const agentProcess = spawn('node', args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });
        
        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            this.running = false;
            logoutAgent(this.name);
            
            if (code > 1) {
                console.log(`Ending task`);
                process.exit(code);
            }

            if (code !== 0 && signal !== 'SIGINT') {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error(`Agent process exited too quickly and will not be restarted.`);
                    return;
                }
                console.log('Restarting agent...');
                this.start(true, 'Agent process restarted.', count_id, this.port);
                last_restart = Date.now();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Agent process error:', err);
        });

        this.process = agentProcess;
    }

    stop() {
        if (!this.running) return;
        this.process.kill('SIGINT');
    }

    forceRestart() {
        if (this.running && this.process && !this.process.killed) {
            console.log(`Agent process for ${this.name} is still running. Attempting to force restart.`);
            
            const restartTimeout = setTimeout(() => {
                console.warn(`Agent ${this.name} did not stop in time. It might be stuck.`);
            }, 5000); // 5 seconds to exit

            this.process.once('exit', () => {
                 clearTimeout(restartTimeout);
                 console.log(`Stopped hanging agent ${this.name}. Now restarting.`);
                 this.start(true, 'Agent process restarted.', this.count_id);
            });
            this.stop(); // sends SIGINT
        } else {
             this.start(true, 'Agent process restarted.', this.count_id);
        }
    }
}