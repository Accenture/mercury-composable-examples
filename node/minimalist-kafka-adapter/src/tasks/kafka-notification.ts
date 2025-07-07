import { Composable, EventEnvelope, AppException, preload, PostOffice } from 'mercury-composable';

/**
 * This composable function sends outbound messages from the caller to any Kafka topics
 */
export class KafkaNotification implements Composable {

    @preload('kafka.notification', 10)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        const po = new PostOffice(evt);
        if (evt.getHeader('topic') && evt.getBody() instanceof Object) {
            const body = evt.getBody() as object;
            if ('content' in body) {
                // convert traceId into x-trace-id header
                if (evt.getTraceId()) {
                    evt.setHeader('x-trace-id', evt.getTraceId());
                } 
                return await po.request(evt.setTo('kafka.adapter'));
            }
        }
        throw new AppException(400, 'Input must contain topic in headers and content in body');        
    }
}
