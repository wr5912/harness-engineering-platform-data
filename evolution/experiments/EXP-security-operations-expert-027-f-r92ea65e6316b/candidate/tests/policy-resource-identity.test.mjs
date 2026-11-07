// 纯 URI 合同与事件分类；不发网络，不访问 SDK、SOC 或持久层。
import test from 'node:test';
import assert from 'node:assert/strict';
import { policyResourceIdentity, policyResourceKind } from '../dsh/managed/policy-resource-identity.mjs';
const base = 'http://127.0.0.1:26113';
const server = 'policy-configuration';
const cases = [
  ['single-status', '/api/v1/policy-configurations/{operationId}', 'operationId', `op_${'1'.repeat(32)}`],
  ['single-result', '/api/v1/policy-configurations/{operationId}/result', 'operationId', `op_${'2'.repeat(32)}`],
  ['plans', '/api/v1/policy-departments/plans/{planId}', 'planId', 'plan_17-a'],
  ['tasks', '/api/v1/policy-departments/tasks/{taskId}', 'taskId', `pgt-${'b'.repeat(60)}`],
  ['drafts', '/api/v1/policy-departments/drafts/{operationId}', 'operationId', 'pdop-12345678-1234-4234-8234-123456789abc'],
];
const proxy = (template, variable, id) => `mcp-group:/${server}/${server}/t/${Buffer.from(base + template).toString('base64url')}?${variable}=${id}`;
test('仅五个已核模板：原生HTTP和单层proxy同ID且外层URI不改写', () => {
  for (const [kind, path, variable, id] of cases) {
    for (const uri of [base + path.replace(`{${variable}}`, id), proxy(path, variable, id)]) {
      assert.deepEqual(policyResourceIdentity({ server, uri }), { kind, id, uri });
      assert.equal(policyResourceKind(uri), kind.startsWith('single-') ? 'single-invalid' : kind);
    }
  }
});
test('group/server、模板原值、canonical编码及唯一原始ID参数缺一拒绝', () => {
  for (const [, path, variable, id] of cases) {
    const uri = proxy(path, variable, id);
    const bad = [uri.replace('/policy-configuration/', '/wrong/'), uri.replace('/policy-configuration/t/', '/wrong/t/'),
      uri.replace('/t/', '/r/'), `${uri}&extra=x`, `${uri}&${variable}=${id}`, uri.replace(`?${variable}=`, '?wrong='),
      uri.replace(`=${id}`, `=%${id.charCodeAt(0).toString(16)}${id.slice(1)}`), `${uri}#fragment`,
      uri.replace('?', '=?'), proxy(path.replace('/api/', '/other/'), variable, id),
      proxy(path, variable, '../other'), proxy(path, variable, id + '/other'),
      ...(variable === 'planId' ? [] : [proxy(path, variable, '123')])];
    for (const value of bad) assert.equal(policyResourceIdentity({ server, uri: value }), undefined, value);
    assert.equal(policyResourceIdentity({ server: 'policy-departments', uri }), undefined);
    assert.equal(policyResourceIdentity({ server, uri, extra: true }), undefined);
  }
  const nested = Buffer.from(proxy(cases[2][1], 'planId', 'plan-1')).toString('base64url');
  assert.equal(policyResourceIdentity({ server, uri: `mcp-group:/${server}/${server}/t/${nested}?planId=plan-1` }), undefined);
});
test('原生HTTP拒凭据、其他host/port、编码点段、query与目录伪模板', () => {
  const uri = `${base}/api/v1/policy-departments/plans/plan-1`;
  for (const value of [uri.replace('127.0.0.1', 'localhost'), uri.replace(':26113', ':26114'),
    uri.replace('http:', 'https:'), uri.replace('http://', 'http://user:pass@'), uri.replace('/plans/', '/plans/../plans/'),
    uri.replace('plan-1', '%70lan-1'), `${uri}?x=1`, `${uri}#x`, `${uri}/more`,
    `${base}/api/v1/policy-departments`, `${base}/api/v1/policy-departments?query=部门`])
    assert.equal(policyResourceIdentity({ server, uri: value }), undefined, value);
});
