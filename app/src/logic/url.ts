// AI 服务地址。设置里的"服务地址"可以留空（用本站），也可以填别的网址；
// 填的不是网址（比如被自动填充成了口令）就当没填，避免请求发到网页上被拒绝（405）。

/** 返回请求前缀：空字符串表示本站；去掉末尾的 /、/api 和 # 之后的部分 */
export function apiBase(raw: string): string {
  const s = raw.trim().replace(/#.*$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(s)) return '';
  return s.replace(/\/+$/, '').replace(/\/api$/i, '');
}

/** 设置页提示：填了但用不上 */
export function isIgnoredBase(raw: string): boolean {
  return raw.trim() !== '' && apiBase(raw) === '';
}
