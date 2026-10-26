import { describe, expect, it } from 'vitest';
import { apiBase, isIgnoredBase } from './url';

describe('AI 服务地址', () => {
  it('留空用本站', () => {
    expect(apiBase('')).toBe('');
    expect(apiBase('   ')).toBe('');
  });
  it('不是网址的当没填（比如被自动填充成口令）', () => {
    expect(apiBase('0123456789abcdef0123456789abcdef')).toBe('');
    expect(apiBase('home-kitchen-6kj.pages.dev')).toBe('');
    expect(isIgnoredBase('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(isIgnoredBase('')).toBe(false);
  });
  it('去掉末尾的斜杠、/api 和 # 之后的部分', () => {
    expect(apiBase('https://a.pages.dev/')).toBe('https://a.pages.dev');
    expect(apiBase('https://a.pages.dev/api/')).toBe('https://a.pages.dev');
    expect(apiBase('https://a.pages.dev/#/settings')).toBe('https://a.pages.dev');
    expect(apiBase(' http://127.0.0.1:8788 ')).toBe('http://127.0.0.1:8788');
  });
});
