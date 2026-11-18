const { test } = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('./client-brief.json');

function runNode(name, input) {
  const node = workflow.nodes.find(candidate => candidate.name === name);
  return new Function('$json', node.parameters.jsCode)(input).json;
}

test('validates normalized brief length and rejects wrong types', () => {
  for (const brief of [null, 20, 'x'.repeat(19), 'x'.repeat(12001)]) {
    assert.equal(runNode('Validate brief', { body: { brief } }).status, 400);
  }
  for (const length of [20, 12000]) {
    const brief = 'x'.repeat(length);
    assert.deepEqual(runNode('Validate brief', { body: { brief: ' ' + brief + ' ' } }), { valid: true, brief });
  }
});

test('returns complete and token-limited text with a truncation flag', () => {
  for (const stop_reason of ['end_turn', 'max_tokens']) {
    const result = runNode('Format draft', {
      statusCode: 200,
      body: { stop_reason, content: [{ type: 'thinking' }, { type: 'text', text: 'Draft' }] }
    });
    assert.equal(result.status, 200);
    assert.equal(result.result.draft, 'Draft');
    assert.equal(result.result.truncated, stop_reason === 'max_tokens');
  }
});

test('handles throttling, timeout, malformed bodies, and empty truncation', () => {
  assert.equal(runNode('Format draft', { statusCode: 429 }).status, 429);
  for (const response of [{ error: 'timeout' }, { statusCode: 500 }, { statusCode: 200, body: { content: {} } }, { statusCode: 200, body: { stop_reason: 'max_tokens', content: [] } }]) {
    assert.equal(runNode('Format draft', response).status, 502);
  }
});

test('configures a bounded provider request and keeps brief text as data', () => {
  const node = workflow.nodes.find(candidate => candidate.name === 'Draft with Claude');
  const brief = 'Quotes: " and template braces: {{x}}';
  const expression = node.parameters.jsonBody.slice(3, -2);
  const request = new Function('$json', 'return (' + expression + ');')({ brief });
  assert.equal(request.model, 'claude-sonnet-5-5');
  assert.equal(request.max_tokens, 5000);
  assert.equal(request.messages[0].content, brief);
  assert.equal(node.parameters.options.timeout, 80000);
  assert.notEqual(node.retryOnFail, true);
});
