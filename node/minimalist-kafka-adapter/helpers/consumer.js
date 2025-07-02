import { Logger } from 'mercury-composable';
import { Kafka } from 'kafkajs'

const log = Logger.getInstance();

const myTopic = 'hello.notice'

async function subscribe(consumer, topics, handleEvent) {
    await consumer.subscribe({ topics: topics });
    log.info(`Consumer subscribed to ${JSON.stringify(topics)}`);
    await consumer.run({
        eachMessage: handleEvent
    });
}

async function main() {
    const client = new Kafka({
        brokers: ['127.0.0.1:9092']
    });

    const consumer = client.consumer({
        groupId: 'group-1'
    });
    await consumer.connect();

    await subscribe(consumer, [myTopic], async (payload) => {
        log.info(`Partition: ${payload.partition}, offset: ${payload.message.offset}, key: ${payload.message.key}`);
        if (payload.message.value instanceof Buffer) {
            const text = String(payload.message.value);
            log.info(text);               
        }
        if (typeof payload.message.value == 'string') {
            log.info(payload.message.value);
        }
    });
}

main();
