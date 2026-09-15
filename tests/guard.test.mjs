import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpUrl } from '../scripts/feed.mjs';

test('公网 http(s) URL 通过', () => {
  assert.doesNotThrow(() => assertPublicHttpUrl('https://example.com/feed.xml'));
  assert.doesNotThrow(() => assertPublicHttpUrl('http://feeds.example.org/rss'));
});

test('非 http(s) 协议拒绝', () => {
  assert.throws(() => assertPublicHttpUrl('ftp://example.com/f'));
  assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'));
});

test('localhost 与内网主机名拒绝', () => {
  assert.throws(() => assertPublicHttpUrl('http://localhost/x'));
  assert.throws(() => assertPublicHttpUrl('http://api.internal/x'));
  assert.throws(() => assertPublicHttpUrl('http://foo.home.arpa/x'));
});

test('私有/保留 IPv4 拒绝', () => {
  for (const h of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.9.9',
    '169.254.1.1', '0.0.0.0', '100.64.0.1']) {
    assert.throws(() => assertPublicHttpUrl(`http://${h}/x`), undefined, h);
  }
  assert.doesNotThrow(() => assertPublicHttpUrl('http://172.32.0.1/x')); // 172.32 不在私网段
});

test('IPv6 环回/链路本地/ULA/v4映射拒绝', () => {
  assert.throws(() => assertPublicHttpUrl('http://[::1]/x'));
  assert.throws(() => assertPublicHttpUrl('http://[fe80::1]/x'));
  assert.throws(() => assertPublicHttpUrl('http://[fd00::1]/x'));
  assert.throws(() => assertPublicHttpUrl('http://[::ffff:127.0.0.1]/x'));
});
