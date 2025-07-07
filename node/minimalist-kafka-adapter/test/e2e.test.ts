import { Logger, Utility, AppConfig, Platform, PostOffice, EventEnvelope, 
    AsyncHttpRequest, MultiLevelMap, ObjectStreamReader, ObjectStreamWriter, ObjectStreamIO } from 'mercury-composable';
import { ComposableLoader } from '../test/preload/preload';

const log = Logger.getInstance();
const util = new Utility();

const ASYNC_HTTP_CLIENT = "async.http.request";
const STREAM_CONTENT = 'x-stream-id';
let targetHost: string;

/**
 * These are end-to-end tests by making HTTP requests with the AsyncHttpClient
 * to the REST endpoints of the hello.world service.
 */
describe('End-to-end tests', () => {

    beforeAll(async () => {
        process.loadEnvFile();
        await ComposableLoader.initialize(8305, true);
        const config = AppConfig.getInstance();
        const port = config.getProperty("server.port");
        targetHost = `http://127.0.0.1:${port}`;
        log.info(`End-to-end tests will use ${targetHost}`);
    });

    afterAll(async () => {
        await Platform.getInstance().stop();
        // give console.log a moment to finish
        await util.sleep(2000);
        log.info("End-to-end tests completed");
    });

    it('can load environment variable', async () => {
        // you can get environment variable from the process.env
        expect(process.env.EXAMPLE_ENV_VAR).toBe('hello world');
        // you can also get it using the configuration management system
        const config = AppConfig.getInstance();
        expect(config.getProperty("EXAMPLE_ENV_VAR")).toBe("hello world");
    });

    it('can do flows', async () => {
        const po = new PostOffice();
        // create profile
        const data = {'id': 200, 'name': 'Peter', 'address': '100 World Blvd', 'telephone': '120-222-0000'};
        const httpRequest1 = new AsyncHttpRequest().setMethod('POST').setTargetHost(targetHost).setUrl('/api/profile')
                                                    .setBody(data).setHeader('content-type', 'application/json');
        const req1 = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest1.toMap());
        const result1 = await po.request(req1, 3000);
        expect(result1).toBeTruthy();
        expect(result1.getBody()).toBeInstanceOf(Object);
        const map1 = new MultiLevelMap(result1.getBody() as object);
        expect(map1.getElement('profile.id')).toBe(200);
        expect(map1.getElement('profile.name')).toBe('Peter');
        expect(map1.getElement('profile.address')).toBe('***');
        expect(map1.getElement('profile.telephone')).toBe('***');
        expect(map1.getElement('type')).toBe('CREATE');
        expect(map1.getElement('secure')).toEqual(['address', 'telephone']);
        // give "create profile" a little while to write profile record because it is asynchronous
        await util.sleep(500);
        const httpRequest2a = new AsyncHttpRequest().setMethod('GET').setTargetHost(targetHost).setUrl('/api/profile/200')
                                                    .setHeader('accept', 'application/json');
        const req2a = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest2a.toMap());
        const result2a = await po.request(req2a, 3000);
        expect(result2a).toBeTruthy();
        expect(result2a.getBody()).toBeInstanceOf(Object);
        const map2a = new MultiLevelMap(result2a.getBody() as object);
        expect(map2a.getElement('id')).toBe(200);
        expect(map2a.getElement('name')).toBe('Peter');
        expect(map2a.getElement('address')).toBe('100 World Blvd');
        expect(map2a.getElement('telephone')).toBe('120-222-0000');
        // test profile not found
        const httpRequest2b = new AsyncHttpRequest().setMethod('GET').setTargetHost(targetHost).setUrl('/api/profile/no-such-profile')
                                        .setHeader('accept', 'application/json');
        const req2b = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest2b.toMap());
        const result2b = await po.request(req2b, 3000);
        expect(result2b).toBeTruthy();
        expect(result2b.getBody()).toBeInstanceOf(Object);
        const map2b = new MultiLevelMap(result2b.getBody() as object);
        expect(result2b.getStatus()).toBe(404);
        expect(map2b.getElement('type')).toBe('error');
        expect(map2b.getElement('status')).toBe(404);
        expect(map2b.getElement('message')).toBe('Profile no-such-profile not found');
        // delete profile
        const httpRequest3 = new AsyncHttpRequest().setMethod('DELETE').setTargetHost(targetHost).setUrl('/api/profile/200')
                                                    .setHeader('accept', 'application/json');
        const req3 = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest3.toMap());
        const result3 = await po.request(req3, 3000);
        expect(result3).toBeTruthy();
        expect(result3.getBody()).toBeInstanceOf(Object);
        const map3 = new MultiLevelMap(result3.getBody() as object);
        expect(map3.getElement('id')).toBe(200);
        expect(map3.getElement('deleted')).toBe(true);
    });

    it('can send and receive Kafka events', async () => {
        const po = new PostOffice();
        // create profile
        const data = {'id': 500, 'name': 'Mary', 'address': '500 World Blvd', 'telephone': '620-333-2612'};
        const httpRequest1 = new AsyncHttpRequest().setMethod('POST').setTargetHost(targetHost).setUrl('/api/profile')
                                                    .setBody(data).setHeader('content-type', 'application/json');
        const req1 = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest1.toMap());
        const result1 = await po.request(req1, 3000);
        expect(result1).toBeTruthy();
        expect(result1.getBody()).toBeInstanceOf(Object);
        const map1 = new MultiLevelMap(result1.getBody() as object);
        expect(map1.getElement('profile.id')).toBe(500);
        expect(map1.getElement('profile.name')).toBe('Mary');
        expect(map1.getElement('profile.address')).toBe('***');
        expect(map1.getElement('profile.telephone')).toBe('***');
        expect(map1.getElement('type')).toBe('CREATE');
        expect(map1.getElement('secure')).toEqual(['address', 'telephone']);
        // send Kafka message through a REST endpoint
        const httpRequest2 = new AsyncHttpRequest().setMethod('GET').setTargetHost(targetHost).setUrl('/api/publish/demo/500');
        const req2 = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest2.toMap());
        const result2 = await po.request(req2, 3000);
        expect(result2.getBody()).toBeInstanceOf(Object);
        const map2 = new MultiLevelMap(result2.getBody() as object);
        expect(map2.getElement('topic')).toBe('hello.world');
        expect(map2.getElement('message')).toBe('Message published');
        // the Kafka event should be routed within 10 ms. For unit test, give it a little bit more time.
        await util.sleep(500);
        // ping "simple.topic.listener" for the received Kafka event
        const req3 = new EventEnvelope().setTo('simple.topic.listener').setHeader('type', 'retrieval');
        const result3 = await po.request(req3, 3000);
        expect(result3.getBody()).toBeInstanceOf(Object);
        const map3 = new MultiLevelMap(result3.getBody() as object);
        expect(map3.getElement('id')).toBe(500);
        expect(map3.getElement('name')).toBe('Mary');
        expect(map3.getElement('address')).toBe('500 World Blvd');
        expect(map3.getElement('telephone')).toBe('620-333-2612');
        expect(map3.getElement('topic')).toBe('hello.world');
        expect(result3.getHeader('topic')).toBe('hello.notice');
    });    

    it('can do e2e health check', async () => {
        const platform = Platform.getInstance();
        const po = new PostOffice();
        const httpRequest = new AsyncHttpRequest().setMethod('GET').setTargetHost(targetHost).setUrl('/health');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const map = new MultiLevelMap(result.getBody() as object);
        expect(map.getElement('name')).toBe('composable-example');
        expect(map.getElement('origin')).toBe(platform.getOriginId());
        expect(map.getElement('up')).toBe(true);
        expect(map.getElement('dependency[0].href')).toBe('http://127.0.0.1');
        expect(map.getElement('dependency[0].route')).toBe('demo.health');
        expect(map.getElement('dependency[0].status_code')).toBe(200);
        expect(map.getElement('dependency[0].message')).toEqual({"status": "demo.service is running fine"});
    });

    it('can do HTTP-GET to /api/hello/world', async () => {
        const po = new PostOffice();
        const httpRequest = new AsyncHttpRequest().setMethod('GET');
        httpRequest.setTargetHost(targetHost).setUrl('/api/hello/world');
        httpRequest.setQueryParameter('x', 'y');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const map = new MultiLevelMap(result.getBody() as object);
        expect(map.getElement('event.headers.user-agent')).toBe('async-http-client');
        expect(map.getElement('event.method')).toBe('GET');
        expect(map.getElement('event.ip')).toBe('127.0.0.1');
        expect(map.getElement('event.url')).toBe('/api/hello/world');
        expect(map.getElement('event.parameters.query.x')).toBe('y');
    });

    it('can do HTTP-GET to /api/hello/concurrent', async () => {
        const po = new PostOffice();
        const httpRequest = new AsyncHttpRequest().setMethod('GET');
        httpRequest.setTargetHost(targetHost).setUrl('/api/hello/concurrent');
        httpRequest.setQueryParameter('x', 'y');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const data = result.getBody() as object;
        expect(Object.keys(data).length).toBe(10);
        const map = new MultiLevelMap(data);
        for (let i=1; i <= 10; i++) {
            expect(map.getElement(`result-${i}.event.headers.user-agent`)).toBe('async-http-client');
            expect(map.getElement(`result-${i}.event.method`)).toBe('GET');
            expect(map.getElement(`result-${i}.event.ip`)).toBe('127.0.0.1');
            expect(map.getElement(`result-${i}.event.url`)).toBe('/api/hello/concurrent');
            expect(map.getElement(`result-${i}.event.parameters.query.x`)).toBe('y');
        }
    });    

    it('can catch HTTP-GET exception from /api/hello/world', async () => {
        const po = new PostOffice();
        const httpRequest = new AsyncHttpRequest().setMethod('GET');
        httpRequest.setTargetHost(targetHost).setUrl('/api/hello/world');
        httpRequest.setQueryParameter('exception', 'true').setHeader('accept', 'application/json');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const body = result.getBody() as object;
        expect(result.getStatus()).toBe(400);
        expect(body['status']).toBe(400);
        expect(body['type']).toBe('error');
        expect(body['message']).toBe('Just a demo exception');
    });

    it('can download file from hello.world', async () => {
        const po = new PostOffice();
        const line1 = 'Congratulations! If you see this file, this means you have successfully download it from this app.\n\n';
        const line2 = 'hello world\n';
        const line3 = 'end of file';
        const httpRequest = new AsyncHttpRequest().setMethod('GET');
        httpRequest.setTargetHost(targetHost).setUrl('/api/hello/world');
        httpRequest.setQueryParameter('download', 'true');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getHeader('content-type')).toBe('application/octet-stream');
        expect(result.getHeader('Content-Disposition')).toBe('attachment; filename=hello.txt');
        expect(result.getHeader(STREAM_CONTENT)).toBeTruthy();
        const streamId = result.getHeader(STREAM_CONTENT);
        const inStream = new ObjectStreamReader(streamId, 3000);
        const blocks = new Array<Buffer>();
        for (let i=0; i < 10; i++) {
            const block = await inStream.read();
            if (block instanceof Buffer) {
                blocks.push(block);
            } else {
                break;
            }
        }
        // the demo file has 3 lines
        expect(blocks.length).toBe(3);
        expect(blocks[0]).toStrictEqual(Buffer.from(line1));
        expect(blocks[1]).toStrictEqual(Buffer.from(line2));
        expect(blocks[2]).toStrictEqual(Buffer.from(line3));
    });

    it('can upload file to hello.world', async () => {
        const line1 = 'hello world\n';
        const line2 = 'second line';
        const po = new PostOffice();
        const filename = 'hello-world.txt';
        const httpRequest = new AsyncHttpRequest().setMethod('POST');
        httpRequest.setTargetHost(targetHost).setUrl('/api/hello/upload');
        httpRequest.setHeader('content-type', 'multipart/form-data');
        const stream = new ObjectStreamIO(60);
        const out = new ObjectStreamWriter(stream.getOutputStreamId());
        // For file upload, the data block must be binary
        out.write(Buffer.from(line1));
        out.write(Buffer.from(line2));
        out.close();
        httpRequest.setStreamRoute(stream.getInputStreamId());
        httpRequest.setFileName(filename);
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const body = result.getBody() as object;
        expect(body[STREAM_CONTENT]).toBeTruthy();
        // the echoed streamId will be different
        // because AsyncHttpClient will send the file upload as another stream
        expect(body[STREAM_CONTENT] != stream.getInputStreamId()).toBe(true);
        expect(body['filename']).toBe(filename);
        expect(typeof body['type']).toBe('string');
        expect(body['service']).toBe('hello.world');
        const originalContentType = body['type'] as string;
        // The AsyncHttpClient will perform the actual multipart file upload.
        // Therefore, the content type will have the boundary ID.
        expect(originalContentType.startsWith('multipart/form-data;')).toBe(true);
        expect(originalContentType.includes('boundary')).toBe(true);
        expect(body['size']).toBe(line1.length + line2.length);
    });

    it('can do HTTP-GET to /api/worker/demo', async () => {
        const po = new PostOffice();
        const httpRequest = new AsyncHttpRequest().setMethod('GET');
        httpRequest.setTargetHost(targetHost).setUrl('/api/worker/demo');
        const req = new EventEnvelope().setTo(ASYNC_HTTP_CLIENT).setBody(httpRequest.toMap());
        const result = await po.request(req, 3000);
        expect(result).toBeTruthy();
        expect(result.getBody()).toBeInstanceOf(Object);
        const map = new MultiLevelMap(result.getBody() as object);
        expect(map.getElement('original.headers.user-agent')).toBe('async-http-client');
        expect(map.getElement('original.headers.x-flow-id')).toBe('worker-thread-demo');

    });    

});
