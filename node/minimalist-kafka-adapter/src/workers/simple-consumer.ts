import { EventEnvelope, Logger, Utility } from 'mercury-composable';
import { Kafka, Consumer, EachMessageHandler } from 'kafkajs';

const log = Logger.getInstance();
const util = new Utility();

export class SimpleKafkaConsumer {
    private readonly consumer: Consumer;
    private readonly id: string;
    private connected = false;

    constructor(client: Kafka, groupId: string) {
        this.id = util.getUuid();
        this.consumer = client.consumer({
            groupId: groupId
        });
    }

    getId() {
        return this.id;
    }

    async connect() {
        await this.consumer.connect();
        this.connected = true;
        log.info(`Consumer ${this.id} started`);
    }

    async subscribe(topics: Array<string>, handleEvent: EachMessageHandler) {
        if (this.consumer && this.connected) {
            await this.consumer.subscribe({ topics: topics });
            log.info(`Consumer ${this.id} subscribed to ${JSON.stringify(topics)}`);
            await this.consumer.run({
                eachMessage: handleEvent
            });            
        } else {
            throw new Error(`Consumer ${this.id} not ready`);
        }
    }

    /**
     * Handle acknowledgement from a task or a flow
     * 
     * (Minimalist implementation uses auto-commit.
     *  Acknowledgement can be used as a signal to do programmatic commit)
     * 
     * @param e if negative acknowledgement
     */
    async ack(evt: EventEnvelope) {
        if (evt.getStatus() >= 400) {
            log.error(`Consumer ${this.id} received exception - rc=${evt.getStatus()} ${JSON.stringify(evt.getBody())}`);
        } else {
            log.info(`Consumer ${this.id} received acknowledgement - ${JSON.stringify(evt.getBody())}`);
        }
    }

    async close() {
        if (this.consumer && this.connected) {
            await this.consumer.disconnect();
            log.info(`Consumer ${this.id} stopped`);    
        }
    }
}
