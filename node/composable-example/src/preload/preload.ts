/*
 * DO NOT modify this file, it will be updated automatically.
 */
import fs from 'fs';
import { fileURLToPath } from "url";
import { Logger, Utility, AppConfig, Platform, RestAutomation, EventScriptEngine, NoOp, ResilienceHandler } from 'mercury-composable';
import { MainApp } from '../autostart/main-application.js';
import { ShutdownHook } from '../autostop/shutdown-hook.js';
import { DemoAuth } from '../services/demo-auth.js';
import { DemoHealthCheck } from '../services/health-check.js';
import { HelloConcurrent } from '../services/hello-concurrent.js';
import { HelloWorld } from '../services/hello-world.js';
import { ComposableAdapter } from '../tasks/composable-adapter.js';
import { CreateProfile } from '../tasks/create-profile.js';
import { DecryptFields } from '../tasks/decrypt-fields.js';
import { DeleteProfile } from '../tasks/delete-profile.js';
import { EncryptFields } from '../tasks/encrypt-fields.js';
import { GetProfile } from '../tasks/get-profile.js';
import { HelloException } from '../tasks/hello-exception.js';
import { SaveProfile } from '../tasks/save-profile.js';

const log = Logger.getInstance();
const util = new Utility();

function getRootFolder() {
    const folder = fileURLToPath(new URL("..", import.meta.url));
    // for windows OS, convert backslash to regular slash and drop drive letter from path
    const filePath = folder.includes('\\')? folder.replaceAll('\\', '/') : folder;
    const colon = filePath.indexOf(':');
    return colon === 1? filePath.substring(colon+1) : filePath;
}

export class ComposableLoader {
    private static loaded = false;

    static async initialize(serverPort?: number, isUnitTest = false) {
        // execute only once
        if (!ComposableLoader.loaded) {
            ComposableLoader.loaded = true;
            try {
                let resourcePath = getRootFolder() + 'resources';
                if (isUnitTest) {
                    const parts = util.split(getRootFolder(), '/');
                    parts.pop();
                    resourcePath = '/' + parts.join('/') + '/tests/resources';
                }
                if (!fs.existsSync(resourcePath)) {
                    throw new Error('Missing resources folder');
                }
                const stats = fs.statSync(resourcePath);
                if (!stats.isDirectory()) {
                    throw new Error('resources is not a folder');
                }
                // initialize base configuration
                const config = AppConfig.getInstance(resourcePath);
                // register the functions into the event system
                const platform = Platform.getInstance();
                platform.register('no.op', new NoOp(), 50);
                platform.register('resilience.handler', new ResilienceHandler(), 100, true, true);
                platform.register('main.app', new MainApp());
                platform.register('shutdown.hook', new ShutdownHook());
                platform.register('v1.api.auth', new DemoAuth());
                platform.register('demo.health', new DemoHealthCheck());
                platform.register(HelloConcurrent.routeName, new HelloConcurrent(), 10);
                platform.register(HelloWorld.routeName, new HelloWorld(), 10, false);
                platform.register('composable.worker.demo', new ComposableAdapter(), 5, true, true);
                platform.register('v1.create.profile', new CreateProfile(), 10);
                platform.register('v1.decrypt.fields', new DecryptFields(), 10);
                platform.register('v1.delete.profile', new DeleteProfile(), 10);
                platform.register('v1.encrypt.fields', new EncryptFields(), 10);
                platform.register(GetProfile.routeName, new GetProfile(), 10);
                platform.register('v1.hello.exception', new HelloException(), 10);
                platform.register('v1.save.profile', new SaveProfile(), 10);
                // start Event Script system
                const eventManager = new EventScriptEngine();
                await eventManager.start();
                // override HTTP server port if running in unit test
                if (serverPort) {
                    config.set('server.port', parseInt(String(serverPort)));
                }
                // start REST automation system
                if ('true' == config.getProperty('rest.automation')) {
                    const server = RestAutomation.getInstance();
                    await server.start();
                }
                // keep the server running
                platform.runForever();
                await platform.getReady();
            } catch (e) {
                log.error(`Unable to preload - ${e.message}`);
            }
        }
    }
}
