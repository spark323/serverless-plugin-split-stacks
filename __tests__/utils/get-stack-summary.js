'use strict';

const test = require('ava');
const sinon = require('sinon');

const utils = require('../../lib/utils');

test.beforeEach(t => {
	t.context = Object.assign({}, utils, { provider: {} });
});

test('calls once', t => {
	const request = sinon.mock().withArgs('CloudFormation', 'listStackResources', {
		StackName: 'foo',
		NextToken: undefined
	})
	.resolves({
		StackResourceSummaries: ['a']
	});

	t.context.provider = {
		request
	};

	return t.context.getStackSummary('foo')
		.then(summary => {
			t.true(request.calledOnce);
			t.deepEqual(summary, ['a']);
		});
});

test('calls twice with NextToken', t => {
	const request = sinon.stub()
		.onCall(0).resolves({
			StackResourceSummaries: ['a'],
			NextToken: 'banana'
		})
		.onCall(1).resolves({
			StackResourceSummaries: ['b']
		});

	t.context.provider = {
		request
	};

	return t.context.getStackSummary('foo')
		.then(summary => {
			t.true(request.calledTwice);
			t.deepEqual(summary, ['a', 'b']);
		});
});

test('uses CloudFormation client when provider exposes AWS SDK v3 client', t => {
	const send = sinon.stub().resolves({
		StackResourceSummaries: ['a']
	});
	const getCloudFormationClient = sinon.stub().resolves({ send });

	t.context.provider = {
		getCloudFormationClient
	};

	return t.context.getStackSummary('foo')
		.then(summary => {
			t.true(getCloudFormationClient.calledOnce);
			t.true(send.calledOnce);
			t.deepEqual(summary, ['a']);
		});
});

test('retry on Rate exceeeded', t => {
	const request = sinon.stub()
		.onCall(0).rejects({
			message: 'Rate exceeded'
		})
		.onCall(1).rejects({
			message: 'Rate exceeded'
		})
		.onCall(2).resolves({
			StackResourceSummaries: ['a']
		});

	t.context.provider = {
		request
	};

	return t.context.getStackSummary('foo')
		.then(summary => {
			t.true(request.calledThrice);
			t.deepEqual(summary, ['a']);
		});
});
