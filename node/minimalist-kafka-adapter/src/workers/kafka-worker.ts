import { AppConfig, ConfigReader, EventEnvelope, Logger, Utility, PostOffice, Sender, FlowExecutor } from 'mercury-composable'
import { SimpleKafkaConsumer } from './simple-consumer.js';
import { SimpleKafkaProducer } from './simple-producer.js';
import { fileURLToPath } from "url";
import { Worker, isMainThread, parentPort } from 'worker_threads';
import { EachMessagePayload, IHeaders, Kafka } from 'kafkajs';
import { EventEmitter } from 'events';

const log = Logger.getInstance();
const util = new Utility();

const RESERVED_METADATA = ['_client', '_target', '_topic', '_partition', '_offset'];
const KAFKA_ADAPTER = 'kafka.adapter';
const FLOW_PROTOCOL = 'flow://';
const SRC_FOLDER = "/src/";
let loaded = false;
let worker: Worker;

export class KafkaWorker {

    static workerBridge() {
        if (!loaded) {
            loaded = true;
            if (isMainThread) {
                worker = new Worker(getJsPath(fileURLToPath(import.meta.url)));
                log.info("Worker created");
                // pass "resource.path" from main thread to the worker immediately
                const config = AppConfig.getInstance();
                const resourcePath = config.getProperty('resource.path');
                const parameters = config.get('runtime.parameters');
                const init = new EventEnvelope().setHeader('type', 'init').setHeader('resource.path', resourcePath).setBody(parameters);
                KafkaWorker.sendEventToWorker(init);

                // listen to messages and responses from the worker
                worker.on('message', async (b) => {
                    const evt = new EventEnvelope(b);
                    // Since this composable worker thread wrapper is an interceptor, it must programmatically send response if needed.                
                    if (evt.getTo() && evt.getReplyTo()) {
                        // To send a response, you must create a new EventEnvelope so that the original metadata is not sent accidentally.
                        const res = new EventEnvelope().setTo(evt.getReplyTo())
                                                        .setBody(evt.getBody())
                                                        .setCorrelationId(evt.getCorrelationId());
                        const po = new PostOffice(evt);
                        po.send(res);
                    } else {
                        // make a copy of the event to drop some protected metadata
                        await handleIncomingKafkaMessage(new EventEnvelope().copy(evt));
                    }     
                });         
            }
        }
    }

    static sendEventToWorker(evt: EventEnvelope) {
        if (worker) {
            // make a copy of the event to drop some protected metadata
            worker.postMessage(new EventEnvelope().copy(evt).toBytes());
        }
    }    
}

/**
 * Handle incoming Kafka message
 * 
 * @param evt for the incoming message to a Kafka topic
 */
async function handleIncomingKafkaMessage(evt: EventEnvelope) {
    const clientId = evt.getHeader('_client');
    const target = evt.getHeader('_target');
    const topic = evt.getHeader('_topic');
    const partition = evt.getHeader('_partition');
    const offset = evt.getHeader('_offset');
    if (clientId && target) {
        // Kafka Flow Adapter will propagate x-trace-id from Kafka message header if any
        const traceId = evt.getHeader('x-trace-id');
        const tracePath = traceId? `TOPIC ${topic}` : null;                            
        const po = new PostOffice(new Sender('kafka.adapter', traceId, tracePath));                            
        if (target.startsWith(FLOW_PROTOCOL)) {
            // send the Kafka event to a flow
            const flowId = target.substring(FLOW_PROTOCOL.length);
            const dataset = {};
            dataset['body'] = evt.getBody();
            dataset['header'] = getKafkaHeaders(evt.getHeaders());
            dataset['metadata'] = {'topic': topic, 'partition': partition, 'offset': offset};
            await FlowExecutor.getInstance().launch(po, flowId, dataset, clientId, KAFKA_ADAPTER);
        } else if (po.exists(target)) {
            // send the Kafka event to a Composable function
            const request = new EventEnvelope().setTo(target).setCorrelationId(clientId).setReplyTo(KAFKA_ADAPTER)
                                .setHeaders(evt.getHeaders()).setBody(evt.getBody());
            await po.send(request);
        } else {
            log.error(`Unable to relay incoming Kafka event - route ${target} not found`);
            const errorEvent = new EventEnvelope().setHeader('client', clientId)
                                    .setHeader('type', 'exception').setBody(`route ${target} not found`);
            KafkaWorker.sendEventToWorker(errorEvent);                            
        }
    }
}

function getKafkaHeaders(headers: object): object {
    const result = {};
    for (const h of Object.keys(headers)) {
        if (!(RESERVED_METADATA.includes(h))) {
            result[h] = headers[h];
        }
    }
    return result;
}

function getJsPath(currentFilePath: string): string {
    // adjust for windows compatibility
    const filePath = currentFilePath.includes('\\')? currentFilePath.replaceAll('\\', '/') : currentFilePath;
    // when the current file is a TypeScript source file, this module is running inside a unit test.
    if (filePath.endsWith(".ts")) {
        log.info("*** Running worker in a unit test - please ensure you have done 'npm run build' ***")
        const sep = filePath.lastIndexOf(SRC_FOLDER);
        if (sep > 0) {
            // since the input argument to a Worker must be a javascript file,
            // we will substitute src with dist folder and ".ts" with ".js"
            const updated = filePath.substring(0, sep) + '/dist/' + filePath.substring(sep + SRC_FOLDER.length);
            return updated.substring(0, updated.length -3) + '.js'; 
        }
    }
    return filePath;
 }

/**
 * The worker will run in a separate kernel thread.
 * 
 * This segment will execute when the worker is created by the main thread.
 * 
 * You therefore can encapsulate any existing libraries or open sources libraries that
 * are not ported as pure composable functions.
 */
if (!isMainThread) {
    let config: ConfigReader;
    let emitter: EventEmitter;
    let client: Kafka;
    let producer: SimpleKafkaProducer;
    let started = false;
    const allConsumers = {};

    parentPort.on('message', async (payload) => {
        const evt = new EventEnvelope(payload);
        const cid = evt.getCorrelationId();
        if (cid && cid in allConsumers) {
            const consumer: SimpleKafkaConsumer = allConsumers[cid];
            consumer.ack(evt);
        } else if ('init' == evt.getHeader('type') && evt.getHeader('resource.path')) {
            // Since this is a new worker, we need to load ".env" environment variables and AppConfig.
            // For AppConfig, we use the same "resource.path" from the main thread (parent).
            process.loadEnvFile();
            // event body should contain runtime parameters
            const params = evt.getBody();
            config = AppConfig.getInstance(evt.getHeader('resource.path'), Array.isArray(params)? params : []);

        } else if ('start' == evt.getHeader('type') && !started) {     
            await startWorker();
        } else if ('stop' == evt.getHeader('type')) {
            await stopWorker(evt);
        } else if (evt.getHeader('topic') && evt.getBody() instanceof Object) {
            handleOutgoingKafkaMessage(evt);
        } else {
            // send event to producer
            sendEventToParent(evt);
        }
    });

    /**
     * Handle outgoing Kafka message
     * 
     * @param evt for the outgoing message to a Kafka topic
     */
    function handleOutgoingKafkaMessage(evt: EventEnvelope) {
        // Kafka Flow Adapter will propagate traceId as a Kafka message header 'x-trace-id' 
        const body = evt.getBody() as object;
        if ('content' in body && producer) {
            const traceId = evt.getTraceId();
            if (traceId) {
                evt.setHeader('x-trace-id', traceId);
            }
            producer.send(evt.getHeader('topic'), body['content'], evt.getHeaders());
        }
        sendEventToParent(evt.setBody({'topic': evt.getHeader('topic'), 'message': 'Event sent', 'time': new Date()}));        
    }

    async function startWorker() {
        started = true;
        // initialize your 3rd party library here if this worker encapsulates a legacy library
        if ('true' == config.getProperty('emulate.kafka')) {
            emitter = new EventEmitter()
        } else {
            client = getKafkaClient();
        }         
        await setupKafkaAdapter();
        log.info(client? "Kafka worker started" : "Kafka emulator started");
    }

    async function stopWorker(evt: EventEnvelope) {
        // send event to parent before closing the event conduit (parentPort)
        sendEventToParent(evt);
        for (const c of Object.keys(allConsumers)) {
            const consumer: SimpleKafkaConsumer = allConsumers[c];
            await consumer.close();
        }
        if (producer) {
            await producer.close();
        }
        parentPort.close();
        log.info(client? "Kafka worker stopped" : "Kafka emulator stopped");
    }

    function sendEventToParent(evt: EventEnvelope) {
        if (parentPort) {
            parentPort.postMessage(evt.toBytes());  
        }
    }

    function getKafkaClient() {
        // load kafka-client.yaml
        const po = new PostOffice();
        const kafkaConfig = new ConfigReader('classpath:/kafka-client.yaml');
        const brokers = kafkaConfig.get('brokers');
        if (Array.isArray(brokers) && brokers.length > 0) {
            const properties = {'brokers': brokers, 'clientId': po.getId()}
            return new Kafka(properties);
        } else {
            throw new Error('Missing brokers in kafka-client.yaml');
        }
    }

    async function setupKafkaAdapter() {
        const adapterConfig = new ConfigReader('classpath:/kafka-adapter.yaml');
        const consumers = adapterConfig.get('consumer');
        if (Array.isArray(consumers)) {
            for (let i=0; i < consumers.length; i++) {
                const topic = adapterConfig.getProperty(`consumer[${i}].topic`);
                const target = adapterConfig.getProperty(`consumer[${i}].target`);
                const groupId = adapterConfig.getProperty(`consumer[${i}].group`);
                const tracing = 'true' == adapterConfig.getProperty(`consumer[${i}].tracing`);
                if (topic && target && groupId) {
                    await setupConsumer(topic, target, groupId, tracing);
                } else {
                    const entry = JSON.stringify(adapterConfig.get(`consumer[${i}]`));
                    log.error(`Each consumer entry must contain topic, target and group - ${entry}`);
                }                
            }
        }
        const producerEnabled = 'true' == adapterConfig.getProperty('producer.enabled');
        if (producerEnabled) {
            producer = new SimpleKafkaProducer(client || emitter);
            await producer.connect();
        }
    }

    async function setupConsumer(topic: string, target: string, groupId: string, tracing: boolean) {
        const consumer = new SimpleKafkaConsumer(client || emitter, groupId);
        allConsumers[consumer.getId()] = consumer;
        await consumer.connect();        
        await consumer.subscribe(topic, async (payload: EachMessagePayload) => {
            let body = null;
            if (payload.message.value instanceof Buffer) {
                const text = String(payload.message.value);
                try {
                    body = JSON.parse(text);
                } catch (e) {
                    if (e instanceof SyntaxError) {
                        body = text;
                    }                    
                }                
            }
            if (typeof payload.message.value == 'string') {
                body = payload.message.value;
            }
            const evt = new EventEnvelope().setBody(body);
            if (payload.message.headers) {
                copyKafkaHeaders(payload.message.headers, evt, tracing);
            }
            // add metadata
            evt.setHeader('_client', consumer.getId())
                .setHeader('_target', target)
                .setHeader('_topic', payload.topic)
                .setHeader('_partition', String(payload.partition))
                .setHeader('_offset', payload.message.offset);
            sendEventToParent(evt);
        });
    }

    function copyKafkaHeaders(headers: IHeaders, evt: EventEnvelope, tracing: boolean) {
        let traceId: string;
        for (const h in headers) {
            const v = headers[h];
            if (typeof v == 'string') {                
                if (util.equalsIgnoreCase(h, 'x-trace-id')) {
                    traceId = v;
                    // guarantee lower-case
                    evt.setHeader('x-trace-id', v);
                } else {
                    evt.setHeader(h, v);
                }
            }                         
        }
        // generate x-trace-id if required
        if (tracing && !traceId) {
            evt.setHeader('x-trace-id', util.getUuid());
        }
    }
}
