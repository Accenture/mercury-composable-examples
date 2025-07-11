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

## Testing this adapter using a Kafka emulator

By default, the main application is configured to use Kafka broker emulation. You will find the application.yml
configuration contains this parameter.

```yaml
#
# To use Kafka emulator instead of a Kafka cluster or standalone Kafka server,
# set emulate.kafka to true
#
emulate.kafka: true
```

The demo application is configured to listen to the Kafka topic "hello.world". 

The kafka-adapter.yaml contains the entry that routes each message from the topic "hello.world"
to the target at "flow://get-profile-kafka". This means that the flow "get-profile-kafka" will
be executed when a message is received. The payload, headers and metadata of the Kafka message
is converted as the "input" object.

*kafka-adapter.yaml*:

```yaml
consumer:
  - topic: 'hello.world'
    target: 'flow://get-profile-kafka'
    group: 'group-100'
    tracing: true

producer.enabled: true
```

Extract of the *get-profile-kafka.yaml* configuration file is shown below:

```yaml
flow:
  id: 'get-profile-kafka'
  description: 'Get a user profile using profile ID thru a Kafka topic'
  ttl: 10s
  exception: 'v1.hello.exception'

first.task: 'v1.get.profile'

tasks:
  - input:
      - 'input.body.profile_id -> header.profile_id'
    process: 'v1.get.profile'
    output:
      - 'result -> model.profile'
    description: 'Retrieve user profile from database using profile_id'
    execution: sequential
    next:
      - 'v1.decrypt.fields'
```

Since the application is configured to use a Kafka emulator, we use a REST endpoint to publish
a Kafka event to the topic "hello.world". The REST endpoint entry is shown in the rest.yaml
config file as follows:

```yaml
  - service: "http.flow.adapter"
    methods: ['GET']
    url: "/api/publish/demo/{profile_id}"
    flow: 'publish-demo'
    timeout: 10s
    cors: cors_1
    headers: header_1
    tracing: true
```

When you use a browser to visit http://127.0.0.1:8086/api/publish/demo/100, it will invoke
the flow "publish-demo". The configuration file for "publish-demo" is like this:

```yaml
flow:
  id: 'publish-demo'
  description: 'send a request thru a Kafka topic'
  ttl: 10s
  exception: 'v1.hello.exception'

first.task: 'publish.message'

tasks:
  - name: 'publish.message'
    input:
      - 'text(hello.world) -> header.topic'
      - 'input.path_parameter.profile_id -> content.profile_id'
      - 'text(Just a demo) -> content.remark'
    process: 'kafka.adapter'
    output:
      - 'text(application/json) -> output.header.content-type'
      - 'input.body -> output.body.content'
      - 'text(hello.world) -> output.body.topic'
      - 'text(Event sent) -> output.body.message'   
    description: 'Send event to a kafka topic'
    execution: end
```

In the "publish-demo" flow configuration, the first task will map HTTP input path parameter
'profile_id' into 'content.profile_id'. The header 'topic' parameter contains the constant
'hello.world'. The 'process' parameter points to the composable function 'kafka.adapter'.

The 'kafka.adapter' will receive the emulated Kafka message through the flow 'get-profile-kafka' that
will execute the "v1.get.profile" and "v1.decrypt.fields" before publishing the result to the Kafka
topic 'hello.notice'. We have not configured a listener for the 'hello.notice' topic so you will not
see it receiving messages.

When you use a browser to visit http://127.0.0.1:8086/api/publish/demo/100, it will send an
acknowledgement to the Kafka Flow Adapter telling that the profile '100' is not found.

You may follow the following link to create a profile with id=100

https://accenture.github.io/mercury-nodejs/guides/CHAPTER-1/#testing-the-application

Then you can visit http://127.0.0.1:8086/api/publish/demo/100 again. It will return data for the
profile 100 accordingly.

Now you have seen a message triggered from a REST endpoint, published to a Kafka topic and the Kafka
Flow Adapter picks it up and routes it to a flow.

## Testing the adapter with a standalone Kafka server

Let's try the application with a real Kafka broker. Please disable the Kafka emulator in the
application.yml first:

```yaml
#
# To use Kafka emulator instead of a Kafka cluster or standalone Kafka server,
# set emulate.kafka to true
#
emulate.kafka: false
```

Then rebuilt the application with `npm run build` and following the following steps.

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
node dist/composable-example.js -Dlog.format=json -Demulate.kafka=false
```

Note that you can update the parameter in application.yml or override it with run-time parameter
using the `-D` command as shown above.


6. Run the producer app to generate a test event using the producer.js program in the "helpers" folder

```shell
node helpers/producer.js
```

7. You will see the event triggers the flow 'get-profile-kafka' and the consumer.js program receiving 
   a response from the flow
