import { Utility, Logger } from 'mercury-composable';
import { Kafka, Partitioners, Producer } from 'kafkajs';

const util = new Utility();
const log = Logger.getInstance();

export class SimpleKafkaProducer {
    private readonly producer: Producer;
    private readonly id: string;    
    private connected = false;

    constructor(client: Kafka) {
        this.id = util.getUuid();
        this.producer = client.producer({
            createPartitioner: Partitioners.DefaultPartitioner
        });
    }

    getId() {
        return this.id;
    }

    async connect() {
        await this.producer.connect();
        this.connected = true;
        log.info(`Producer ${this.id} started`);
    }

    async send(topic: string, message: object, headers?: object) {
        if (this.producer && this.connected) {
            const bytes = Buffer.from(JSON.stringify(message));
            await this.producer.send({
                topic: topic,
                messages: [{
                    key: util.getUuid(),
                    value: bytes,
                    headers: getStringHeaders(headers)
                }]
            });
        } else {
            throw new Error(`Producer ${this.id} not ready`);
        }
    }

    async close() {
        if (this.producer && this.connected) {
            await this.producer.disconnect();
            log.info(`Producer ${this.id} stopped`)
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
