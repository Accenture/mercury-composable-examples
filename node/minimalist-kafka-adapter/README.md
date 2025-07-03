# Example application

This is a Composable example application for the [Composable Node.js project](https://github.com/Accenture/mercury-nodejs)

## Developer Guide

For documentation, please browse:

[Chapter 1, Developer Guide](https://accenture.github.io/mercury-nodejs/guides/CHAPTER-1/)
and [Methodology](https://accenture.github.io/mercury-nodejs/guides/METHODOLOGY/).

## Fetch updated foundation library

The foundation library is actively maintained and thus it will be updated frequently.

Please pull the latest mercury-composable library for Node.js with this:

```shell
npm install https://github.com/Accenture/mercury-nodejs
```

## Testing this minimalist Kafka Adapter

1. Start a standalone Kafka server in the same machine. A convenient one is available at

https://github.com/Accenture/mercury-composable/tree/main/connectors/adapters/kafka/kafka-standalone

2. Create two demo Kafka topics using the create-topic.js program in the "helpers" folder

```shell
node helpers/create-topic.js  
```

3. Run the consumer app to listen to the topic 'hello.notice' using the consumer.js program in the "helpers" folder

```shell
node helpers/consumer.js 
```

4. build the app

```shell
npm run build
```

5. run the app

```shell
node dist/composable-example.js 
```

6. Run the producer app to generate a test event using the producer.js program in the "helpers" folder

```shell
node helpers/producer.js
```

7. You will see the event triggers the flow 'get-profile-kafka' and the consumer.js program receiving a response from the flow
