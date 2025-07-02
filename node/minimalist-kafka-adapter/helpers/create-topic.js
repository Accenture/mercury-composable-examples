import { Logger } from 'mercury-composable';
import { Kafka } from 'kafkajs'

const log = Logger.getInstance();

const topicList = {
    'hello.world': 10,
    'hello.notice': 5
}

function topicExists(existing, topic) {
    for (const item of existing) {
        if (topic == item) {
            return true;
        }
    }
    return false;
}

async function main() {
    const client = new Kafka({
        brokers: ['127.0.0.1:9092']
    });
    const admin = client.admin();
    await admin.connect();

    const existing = await admin.listTopics();
    log.info(JSON.stringify(existing, null, 2));

    const myTopics = [];
    for (const c of Object.keys(topicList)) {
        if (topicExists(existing, c)) {            
            log.info(`${c} already exists`);
        } else {
            const n = topicList[c];
            myTopics.push({
                topic: c,
                numPartitions: n
            });
        }
    }
    if (myTopics.length > 0) {
        await admin.createTopics({
            topics: myTopics
        });
        const found = await admin.listTopics();
        log.info(JSON.stringify(found, null, 2));
    }
    await admin.disconnect();
}

main();
