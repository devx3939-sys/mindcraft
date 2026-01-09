import THREE from 'three';
import fs from 'fs/promises';
import { Vec3 } from 'vec3';
import { EventEmitter } from 'events';

import worker_threads from 'worker_threads';
global.Worker = worker_threads.Worker;

export class Camera extends EventEmitter {
    constructor (bot, fp) {
        super();
        this.bot = bot;
        this.fp = fp;
        this.viewDistance = 12;
        this.width = 800;
        this.height = 512;
        this.canvas = null;
        this.renderer = null;
        this.viewer = null;
        this.worldView = null;

        // initialize viewer resources lazily and safely
        this._init().then(() => {
            this.emit('ready');
        }).catch(err => {
            console.warn('Camera failed to initialize (viewer will be disabled):', err && err.message ? err.message : err);
        });
    }

    async _init () {
        // Lazy-load heavy viewer modules; failure should not crash the agent
        let Viewer, WorldView, getBufferFromStream, createCanvas;
        try {
            const pv = await import('prismarine-viewer/viewer/lib/viewer.js');
            Viewer = pv.Viewer;
            const wv = await import('prismarine-viewer/viewer/lib/worldView.js');
            WorldView = wv.WorldView;
            const su = await import('prismarine-viewer/viewer/lib/simpleUtils.js');
            getBufferFromStream = su.getBufferFromStream;
            const canvasMod = await import('node-canvas-webgl/lib/index.js');
            createCanvas = canvasMod.createCanvas;
        } catch (err) {
            // Viewer not available in this environment
            throw new Error('prismarine-viewer or canvas not available: ' + (err && err.message ? err.message : err));
        }

        this.canvas = createCanvas(this.width, this.height);
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas });
        this.viewer = new Viewer(this.renderer);

        const botPos = this.bot.entity.position;
        const center = new Vec3(botPos.x, botPos.y+this.bot.entity.height, botPos.z);
        this.viewer.setVersion(this.bot.version);
        // Load world
        const worldView = new WorldView(this.bot.world, this.viewDistance, center);
        this.viewer.listen(worldView);
        worldView.listenToBot(this.bot);
        await worldView.init(center);
        this.worldView = worldView;

        // store function for later
        this._getBufferFromStream = getBufferFromStream;
    }

    async capture() {
        if (!this.viewer || !this.worldView || !this.canvas) {
            throw new Error('Viewer not initialized');
        }

        const center = new Vec3(this.bot.entity.position.x, this.bot.entity.position.y+this.bot.entity.height, this.bot.entity.position.z);
        this.viewer.camera.position.set(center.x, center.y, center.z);
        await this.worldView.updatePosition(center);
        this.viewer.setFirstPersonCamera(this.bot.entity.position, this.bot.entity.yaw, this.bot.entity.pitch);
        this.viewer.update();
        this.renderer.render(this.viewer.scene, this.viewer.camera);

        const imageStream = this.canvas.createJPEGStream({
            bufsize: 4096,
            quality: 100,
            progressive: false
        });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `screenshot_${timestamp}`;

        const buf = await this._getBufferFromStream(imageStream);
        await this._ensureScreenshotDirectory();
        await fs.writeFile(`${this.fp}/${filename}.jpg`, buf);
        console.log('saved', filename);
        return filename;
    }

    async _ensureScreenshotDirectory() {
        let stats;
        try {
            stats = await fs.stat(this.fp);
        } catch (e) {
            if (!stats?.isDirectory()) {
                await fs.mkdir(this.fp);
            }
        }
    }
}
  
