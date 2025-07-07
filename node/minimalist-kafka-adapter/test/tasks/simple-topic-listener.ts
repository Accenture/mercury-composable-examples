import { Composable, EventEnvelope, Logger } from "mercury-composable";

const log = Logger.getInstance();

const received = new EventEnvelope();

export class SimpleTopicListener implements Composable {
    static readonly routeName = 'simple.topic.listener'

    // @preload(SimpleTopicListener.routeName, 1)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        if ('retrieval' == evt.getHeader('type')) {
            log.info("Forward received Kafka event");
            return received;
        } else {
            log.info({'message': 'Received Kafka event', 'body': evt.getBody(), 'headers': evt.getHeaders()});
            received.copy(evt);
            return evt;
        }
    }
}
