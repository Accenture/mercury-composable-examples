import { Utility, Logger, EventEnvelope } from 'mercury-composable';
import { Kafka, Partitioners, Producer } from 'kafkajs';
import EventEmitter from 'events';

const util = new Utility();
const log = Logger.getInstance();

export class SimpleKafkaProducer {
    private readonly producer: Producer;
    private readonly id: string; 
    private readonly emitter: EventEmitter;
    private connected = false;

    constructor(client: Kafka | EventEmitter) {
        this.id = util.getUuid();
        if (client instanceof Kafka) {
            this.producer = client.producer({
                createPartitioner: Partitioners.DefaultPartitioner
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
            if (this.producer) {
                await this.producer.connect();    
            }
            log.info(`Producer ${this.id} started`);
            this.connected = true; 
        }
    }

    async send(topic: string, message, headers?: object) {
        if (this.connected) {
            let bytes: Buffer = null;
            if (typeof message == 'string') {
                bytes = Buffer.from(message);
            } else if (message instanceof Buffer) {
                bytes = message;
            } else {
                bytes = Buffer.from(JSON.stringify(message));
            } 
            if (this.producer) {
                await this.producer.send({
                    topic: topic,
                    messages: [{
                        key: util.getUuid(),
                        value: bytes,
                        headers: getStringHeaders(headers)
                    }]
                });
            } else {
                // send message using Kafka emulator
                const evt = new EventEnvelope().setHeaders(headers).setBody(bytes);
                this.emitter.emit(topic, evt.toBytes());
            }
        } else {
            throw new Error(`Producer ${this.id} not ready`);
        }
    }

    async close() {
        if (this.connected) {
            if (this.producer) {
                await this.producer.disconnect();
            }
            log.info(`Producer ${this.id} stopped`);
        }
    }
}

function getStringHeaders(headers?: object) {
    const result = {};
    if (headers) {
        for (const k of Object.keys(headers)) {
            result[String(k)] = String(headers[k]);
        }
    }
    return result;
}
