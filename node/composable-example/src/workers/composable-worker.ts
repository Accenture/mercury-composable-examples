import { AppConfig, Composable, ConfigReader, EventEnvelope, Logger, PostOffice, preload } from 'mercury-composable'
import { fileURLToPath } from "url";
import { Worker, isMainThread, parentPort } from 'worker_threads';

const log = Logger.getInstance();

const SRC_FOLDER = "/src/";
let loaded = false;
let worker: Worker;

/**
 * This is a sample code "template" for writing a composable function to encapsulate a worker thread.
 * 
 * For clean and high performance encapsulation of legacy libraries, please review this source code
 * and use it as a template. Worker threads are heavy. Please use it with care.
 * 
 * A worker thread runs in a separate V8 instance with its own memory space.
 * Therefore, it provides full isolation from the main thread that is a composable application.
 * 
 * This is useful when using legacy libraries that you cannot refactor them into composable functions.
 * This wrapper would fully encapsulate a legacy library so that it behaves as a composable function
 * to the rest of the application. Composable function is always self-contained and independent.
 */
export class ComposableWorker implements Composable {

    // Composable worker is configured as an interceptor so its responses are ignored.
    // You can check if the incoming request has a "replyTo" and then send a response accordingly.
    @preload('composable.worker.demo', 5, true, true)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        // deferred startup until triggered by autostart or your own setup task
        if (!loaded && 'start' == evt.getHeader('type')) {
            workerBridge();
        }
        if (worker) {
            // sending the original event to the worker to preserve metadata for tracing and correlation
            sendEventToWorker(evt);
        }
        return null;
    }
}

function getJsPath(currentFilePath: string): string {
    // adjust for windows compatibility
    const filePath = currentFilePath.includes('\\')? currentFilePath.replaceAll('\\', '/') : currentFilePath;
    // when the current file is a TypeScript source file, this module is running inside a unit test.
    if (filePath.endsWith(".ts")) {
        log.info("*** Running worker in a unit test - please ensure you have done 'npm run build' ***")
        const sep = filePath.lastIndexOf(SRC_FOLDER);
        if (sep > 0) {
            // since the input argument to a Worker must be a javascript file,
            // we will substitute src with dist folder and ".ts" with ".js"
            const updated = filePath.substring(0, sep) + '/dist/' + filePath.substring(sep + SRC_FOLDER.length);
            return updated.substring(0, updated.length -3) + '.js'; 
        }
    }
    return filePath;
 }

function workerBridge() {
    if (!loaded) {
        loaded = true;
        if (isMainThread) {
            worker = new Worker(getJsPath(fileURLToPath(import.meta.url)));
            log.info("Worker created");
            // pass "resource.path" from main thread to the worker immediately
            const config = AppConfig.getInstance();
            const resourcePath = config.getProperty('resource.path');
            const parameters = config.get('runtime.parameters');
            const init = new EventEnvelope().setHeader('type', 'init').setHeader('resource.path', resourcePath).setBody(parameters);
            sendEventToWorker(init);

            // listen to messages and responses from the worker
            worker.on('message', (b) => {
                const evt = new EventEnvelope(b);
                // Since this composable worker thread wrapper is an interceptor, it must programmatically send response if needed.
                const po = new PostOffice(evt);
                if (evt.getReplyTo()) {
                    // To send a response, you must create a new EventEnvelope so that the original metadata is not sent accidentally.
                    const res = new EventEnvelope().setTo(evt.getReplyTo())
                                                    .setBody(evt.getBody())
                                                    .setCorrelationId(evt.getCorrelationId());
                    po.send(res);
                }      
            });         
        }
    }
}

function sendEventToWorker(evt: EventEnvelope) {
    if (worker) {
        // make a copy of the event to drop some protected metadata
        const b = new EventEnvelope().copy(evt).toBytes();
        worker.postMessage(b, [b.buffer]);
    }
}

/**
 * The worker will run in a separate kernel thread.
 * 
 * This segment will execute when the worker is created by the main thread.
 * 
 * You therefore can encapsulate any existing libraries or open sources libraries that
 * are not ported as pure composable functions.
 */
if (!isMainThread) {
    let config: ConfigReader;

    function sendEventToParent(evt: EventEnvelope) {
        if (parentPort) {
            const b = evt.toBytes();
            parentPort.postMessage(b, [b.buffer]);  
        }
    }

    parentPort.on('message', (payload) => {
        const evt = new EventEnvelope(payload);
        if ('init' == evt.getHeader('type') && evt.getHeader('resource.path')) {
            // Since this is a new worker, we need to load ".env" environment variables and AppConfig.
            // For AppConfig, we use the same "resource.path" from the main thread (parent).
            process.loadEnvFile();
            // event body should contain runtime parameters
            const params = evt.getBody();
            config = AppConfig.getInstance(evt.getHeader('resource.path'), Array.isArray(params)? params : []);

        } else if ('start' == evt.getHeader('type')) {
            log.info("Worker started");
            log.info("Demonstrate that I can read config. e.g. server.port = "+config.getProperty('server.port'));            
            // initialize your 3rd party library here if this worker encapsulates a legacy library
        } else if ('stop' == evt.getHeader('type')) {
            // send event to parent before closing the event conduit (parentPort)
            sendEventToParent(evt);
            log.info("Worker stopped");
            parentPort.close();
        } else {
            // call your legacy library, if any, and send a response or acknowledgement back to the parent.
            // OK. This is a demo so we just echo back the original event.
            sendEventToParent(evt);
        }
    });     
}
