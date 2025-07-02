import { Composable, EventEnvelope, preload } from 'mercury-composable'
import { DemoWorker } from '../workers/demo-worker.js'

/**
 * This is a sample code "template" for writing a composable function to encapsulate a worker thread.
 * 
 * For clean and high performance encapsulation of legacy libraries, please review this source code
 * and use it as a template. Worker threads are heavy. Use it with care.
 * 
 * A worker thread runs in a separate V8 instance with its own memory space.
 * Therefore, it provides full isolation from the main thread that is a composable application.
 * 
 * This is useful when using legacy libraries that you cannot refactor them into composable functions.
 * This wrapper would fully encapsulate a legacy library so that it behaves as a composable function
 * to the rest of the application. Composable function is always self-contained and independent.
 */
export class ComposableAdapter implements Composable {

    // Composable worker is configured as an interceptor so its responses are ignored.
    // You can check if the incoming request has a "replyTo" and then send a response accordingly.
    @preload('composable.worker.demo', 5, true, true)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        // deferred startup until triggered by autostart or your own setup task
        if ('start' == evt.getHeader('type')) {
            DemoWorker.workerBridge();
        }
        // sending the original event to the worker to preserve metadata for tracing and correlation
        DemoWorker.sendEventToWorker(evt);
        return null;
    }
}
