import { Utility, Logger } from 'mercury-composable';
import { Kafka, Partitioners } from 'kafkajs'

const util = new Utility();
const log = Logger.getInstance();

const myTopic = 'hello.world'

async function send(producer, topic, message) {
    const bytes = Buffer.from(JSON.stringify(message));
    await producer.send({
        topic: topic,
        messages: [{
            key: util.getUuid(),
            value: bytes
        }]
    });
}

async function main() {
    const client = new Kafka({
        brokers: ['127.0.0.1:9092']
    });

    const producer = client.producer({
        createPartitioner: Partitioners.DefaultPartitioner
    });
    await producer.connect();

    for (let i=0; i < 1; i++) {
        await send(producer, myTopic, {'profile_id': '100', 'seq': i});
    }

    log.info("Messages sent");

    await producer.disconnect();
}

main();
