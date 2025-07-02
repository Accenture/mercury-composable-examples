import { preload, Composable, Platform, EventEnvelope, Logger, CryptoApi, Utility } from 'mercury-composable';

import fs from 'fs';

const TEMP_KEY_STORE = "/tmp/keystore";
const DEMO_MASTER_KEY = `${TEMP_KEY_STORE}/demo.txt`;

const log = Logger.getInstance();
const util = new Utility();

export class MainApp implements Composable {

    @preload('main.app')
    initialize(): Composable {
        return this;
    }

    // This 'main.app' function is configured in the 'modules.autostart' parameter in application.yml
    // It will be started automatically.
    async handleEvent(_evt: EventEnvelope) {
        // create a master encryption key if not exists
        if (!fs.existsSync(TEMP_KEY_STORE)) {
            fs.mkdirSync(TEMP_KEY_STORE);
        }
        if (!fs.existsSync(DEMO_MASTER_KEY)) {
            const crypto = new CryptoApi();
            const b64Key = util.bytesToBase64(crypto.generateAesKey());
            await util.str2file(DEMO_MASTER_KEY, b64Key);
            log.info(`Demo encryption key ${DEMO_MASTER_KEY} created`);
        }
        log.info("Application started");
        // release this function to guarantee that it is executed only once
        Platform.getInstance().release('main.app');      
        // return value is ignored because start up code runs asynchronously
        return true;
    }
}
