import { Composable, EventEnvelope, preload } from 'mercury-composable';
import { KafkaWorker } from '../workers/kafka-worker.js';

/**
 * This is a sample code "template" for writing a Kafka Flow Adapter to encapsulate
 * Kafka client library in a worker thread
 */
export class KafkaAdapter implements Composable {

    // Kafka Adapter is an interceptor so its responses are ignored.
    // Instead, the underlying KafkaWorker will send response to the caller.
    @preload('kafka.adapter', 10, true, true)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        // deferred startup until triggered by autostart or your own setup task
        if ('start' == evt.getHeader('type')) {
            KafkaWorker.workerBridge();
        }
        // sending the original event to the worker to preserve metadata for tracing and correlation
        KafkaWorker.sendEventToWorker(evt);
        return null;
    }
}
