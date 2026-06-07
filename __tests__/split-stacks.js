'use strict';

const test = require('ava');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const StackSplitter = require('../split-stacks');
const sampleTemplate = require('./fixtures/sample-template.json');

test.beforeEach(t => {
  t.context.serverless = {
    version: '1.13.2',
    utils: {
      readFileSync: path => require(path)
    },
    service: {
      provider: {
        region: 'us-east-1',
        compiledCloudFormationTemplate: sampleTemplate
      },
      package: {}
    },
    getProvider: () => t.context.provider,
    config: {
      servicePath: __dirname
    }
  };
  t.context.provider = {
    naming: {
      getStackName: () => 'test-stack'
    },
    getServerlessDeploymentBucketName: () => Promise.resolve('bucket')
  };
  t.context.options = {};
  t.context.splitter = new StackSplitter(t.context.serverless, t.context.options);

  t.context.splitter.writeNestedStacks = sinon.spy();
  t.context.splitter.log = sinon.spy();
  t.context.splitter.getStackSummary = sinon.stub().resolves([]);

  const first = {
    1: 'one'
  };
  const second = {
    2: 'two'
  };

  t.context.splitter.resourcesById = {
    first,
    second
  };
  t.context.splitter.rootTemplate = {
    Resources: {
      second
    }
  };
});

test('splits', t => {
  const splitter = t.context.splitter;

  return splitter.split()
    .then(() => {
      t.pass();
    });
});

test('prints a summary', t => {
  const splitter = t.context.splitter;

  splitter.nestedStacks = {
    foo: {
      Resources: {}
    }
  };
  splitter.log = sinon.spy();
  splitter.logSummary();

  t.true(splitter.log.called);
});

test('stays quiet when nothing was split', t => {
  const splitter = t.context.splitter;

  splitter.log = sinon.spy();
  splitter.logSummary();

  t.false(splitter.log.called);
});

test('throws if older serverless version is used', t => {
  const e = t.throws(() => {
     new StackSplitter({
       version: '1.10.0'
     });
  });

  t.true(e.message.indexOf('requires serverless 1.13 or higher') > 0);
});

test('upload does not get encryption params if provider.deploymentBucketObject not set', t => {
  const splitter = t.context.splitter;

  const stub = splitter.getEncryptionParams = sinon.stub().returns({});

  splitter.provider.getServerlessDeploymentBucketName = sinon.stub().resolves('test');
  splitter.getNestedStackFiles = sinon.stub().returns([{
    key: 'test',
    createReadStream: sinon.stub()
  }]);
  splitter.provider.request = sinon.stub().resolves();

  return splitter.upload()
    .then(() => {
      t.false(stub.calledOnce);
    });
});

test('upload uses AWS SDK v3 client when provider exposes v3 config', t => {
  const send = sinon.stub().resolves();
  const request = sinon.stub().resolves();
  let putObjectInput;

  class PutObjectCommand {
    constructor(input) {
      putObjectInput = input;
    }
  }

  class S3Client {
    constructor(config) {
      t.deepEqual(config, { region: 'us-east-1' });
    }

    send(command) {
      t.true(command instanceof PutObjectCommand);
      return send(command);
    }
  }

  const V3StackSplitter = proxyquire('../split-stacks', {
    '@aws-sdk/client-s3': {
      PutObjectCommand,
      S3Client
    }
  });
  const splitter = new V3StackSplitter(t.context.serverless, t.context.options);

  splitter.provider.getServerlessDeploymentBucketName = sinon.stub().resolves('test-bucket');
  splitter.provider.getAwsSdkV3Config = sinon.stub().resolves({ region: 'us-east-1' });
  splitter.provider.request = request;
  splitter.getNestedStackFiles = sinon.stub().returns([{
    key: 'test-key',
    createReadStream: sinon.stub().returns('body')
  }]);

  return splitter.upload()
    .then(() => {
      t.true(send.calledOnce);
      t.false(request.called);
      t.deepEqual(putObjectInput, {
        Bucket: 'test-bucket',
        Key: 'test-key',
        Body: 'body',
        ContentType: 'application/json'
      });
    });
});

test('upload does get encryption params if provider.deploymentBucketObject set', t => {
  t.context.serverless.service.provider.deploymentBucketObject = {};

  const splitter = t.context.splitter;

  const stub = splitter.getEncryptionParams = sinon.stub().returns({});

  splitter.provider.getServerlessDeploymentBucketName = sinon.stub().resolves('test');
  splitter.getNestedStackFiles = sinon.stub().returns([{
    key: 'test',
    createReadStream: sinon.stub()
  }]);
  splitter.provider.request = sinon.stub().resolves();

  return splitter.upload()
    .then(() => {
      t.true(stub.calledOnce);
    });
});
