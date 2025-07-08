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
        if (evt.getHeader('topic') && evt.getBody() instanceof Object) {
            const body = evt.getBody() as object;
            if ('content' in body) {
                // convert traceId into x-trace-id header
                if (evt.getTraceId()) {
                    evt.setHeader('x-trace-id', evt.getTraceId());
                } 
                // ask 'kafka.adapter' to send a message to a Kafka topic asynchronously
                const req = new EventEnvelope().setTo('kafka.adapter').setBody(evt.getBody()).setHeaders(evt.getHeaders());
                // use PostOffice without tracking to reduce observability noise when forwarding request to 'kafka.adapter'
                const po = new PostOffice();
                await po.send(req);
                return {'message': 'Event sent', 'topic': evt.getHeader('topic'), 'time':  new Date()};
            }
        }
        throw new AppException(400, 'Input must contain topic in headers and content in body');        
    }
}
