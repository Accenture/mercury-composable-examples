import { EventEnvelope, Logger, Utility } from 'mercury-composable';
import { Kafka, Consumer } from 'kafkajs';
import EventEmitter from 'events';

const log = Logger.getInstance();
const util = new Utility();
type MessageHandler = (payload: object) => Promise<void>;

export class SimpleKafkaConsumer {
    private readonly consumer: Consumer;
    private readonly id: string;
    private readonly emitter: EventEmitter;
    private seq = 0;
    private connected = false;

    constructor(client: Kafka | EventEmitter, groupId: string) {        
        this.id = util.getUuid();
        if (client instanceof Kafka) {
            this.consumer = client.consumer({
                groupId: groupId
            });
        } else if (client instanceof EventEmitter) {
            this.emitter = client;
        } else {
            throw new Error('client must be an instance of Kafka or EventEmitter');
        }
    }

    getId() {
        return this.id;
    }

    async connect() {
        if (!this.connected) {
            if (this.consumer) {
                await this.consumer.connect();    
            }
            log.info(`Consumer ${this.id} started`);
            this.connected = true; 
        }
    }

    async subscribe(topic: string, handleEvent: MessageHandler) {
        if (this.connected) {
            if (this.consumer) {
                await this.consumer.subscribe({ topics: [topic] });                
                await this.consumer.run({
                    eachMessage: handleEvent
                });
            } else {
                // consume message from Kafka emulator
                this.emitter.on(topic, async (b: Buffer) => {
                    this.seq++;
                    const evt = new EventEnvelope(b);
                    const bytes = evt.getBody() as Buffer;
                    const message = {
                        key: Buffer.from(evt.getId()),
                        value: bytes,
                        timestamp: new Date().toISOString(),
                        attributes: 0,
                        offset: String(this.seq),
                        size: b.length,
                        headers: evt.getHeaders()
                    }
                    const data = {
                        topic: topic,
                        partition: 0,
                        message: message
                    };
                    await handleEvent(data);
                });                
            }
            log.info(`Consumer ${this.id} subscribed to ${topic}`);           
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
     * @param evt - response event
     */
    async ack(evt: EventEnvelope) {
        const data = evt.getStatus() >= 400? 
                    {'message': `Consumer ${this.id} received exception`, 'status': evt.getStatus(), 'error': evt.getBody()} :
                    {'message': `Consumer ${this.id} received acknowledgement`, 'headers': evt.getHeaders(), 'body': evt.getBody()};
        log.info(data);
    }

    async close() {
        if (this.connected) {
            if (this.consumer) {
                await this.consumer.disconnect();
            }
            log.info(`Consumer ${this.id} stopped`);
        }
    }
}
