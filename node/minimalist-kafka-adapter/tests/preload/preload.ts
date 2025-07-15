/*
 * DO NOT modify this file, it will be updated automatically.
 */
import fs from 'fs';
import { fileURLToPath } from "url";
import { Logger, Utility, AppConfig, Platform, RestAutomation, EventScriptEngine, NoOp, ResilienceHandler } from 'mercury-composable';
import { MainApp } from '../../src/autostart/main-application.ts';
import { ShutdownHook } from '../../src/autostop/shutdown-hook.ts';
import { DemoAuth } from '../../src/services/demo-auth.ts';
import { DemoHealthCheck } from '../../src/services/health-check.ts';
import { HelloConcurrent } from '../../src/services/hello-concurrent.ts';
import { HelloWorld } from '../../src/services/hello-world.ts';
import { CreateProfile } from '../../src/tasks/create-profile.ts';
import { DecryptFields } from '../../src/tasks/decrypt-fields.ts';
import { DeleteProfile } from '../../src/tasks/delete-profile.ts';
import { EncryptFields } from '../../src/tasks/encrypt-fields.ts';
import { GetProfile } from '../../src/tasks/get-profile.ts';
import { HelloException } from '../../src/tasks/hello-exception.ts';
import { KafkaAdapter } from '../../src/tasks/kafka-adapter.ts';
import { KafkaNotification } from '../../src/tasks/kafka-notification.ts';
import { SaveProfile } from '../../src/tasks/save-profile.ts';
import { SimpleTopicListener } from '../tasks/simple-topic-listener.ts';

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
                platform.register('v1.create.profile', new CreateProfile(), 10);
                platform.register('v1.decrypt.fields', new DecryptFields(), 10);
                platform.register('v1.delete.profile', new DeleteProfile(), 10);
                platform.register('v1.encrypt.fields', new EncryptFields(), 10);
                platform.register('v1.get.profile', new GetProfile(), 10);
                platform.register('v1.hello.exception', new HelloException(), 10);
                platform.register('kafka.adapter', new KafkaAdapter(), 10, true, true);
                platform.register('kafka.notification', new KafkaNotification(), 10);
                platform.register('v1.save.profile', new SaveProfile(), 10);
                platform.register(SimpleTopicListener.routeName, new SimpleTopicListener(), 1);
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
