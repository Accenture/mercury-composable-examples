import { Composable, EventEnvelope } from "mercury-composable";

export class SimpleTestTask implements Composable {
    static readonly routeName = 'simple.test.task'

    // @preload(SimpleTestTask.routeName, 10)
    initialize(): Composable {
        return this;
    }

    async handleEvent(evt: EventEnvelope) {
        return evt.setHeader('type', 'simple-test');
    }
}
