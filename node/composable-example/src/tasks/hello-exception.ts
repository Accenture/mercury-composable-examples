import { Composable, EventEnvelope, preload, Logger, Utility } from "mercury-composable";

const log = Logger.getInstance();
const util = new Utility();

export class HelloException implements Composable {

    @preload('v1.hello.exception', 10)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        const input = evt.getBody() as object;        
        if (typeof input['stack'] == 'string') {
            const stack = util.split(input['stack'], '\n');
            log.info({'stack': stack});
        }            
        if ((typeof input['status'] == 'number' || typeof input['status'] == 'string') && 'message' in input) {
            const errorMessage = typeof input['message'] == 'string'? input['message'] : JSON.stringify(input['message']);
            log.info(`User defined exception handler - status=${input['status']} error=${errorMessage}`);
            const error = {};
            error['type'] = 'error';
            error['status'] = input['status'];
            error['message'] = input['message'];
            return error;
        } else {
            return {};
        }
    }
}