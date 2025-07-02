import { preload, Composable, EventEnvelope, Logger } from 'mercury-composable';

const log = Logger.getInstance();

export class ShutdownHook implements Composable {

    @preload('shutdown.hook')
    initialize(): Composable {
        return this;
    }

    // This 'shutdown.hook' function is configured in the 'modules.autostop' parameter in application.yml
    // It will be executed automatically when your application exits
    async handleEvent(_evt: EventEnvelope) {
        // this is a placeholder to demonstrate the autostop feature
        log.info("Application stopped");
        return true;
    }
}
