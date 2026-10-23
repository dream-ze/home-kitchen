// crypto.randomUUID 只在安全上下文（https / localhost）可用；局域网 http 调试时退回到随机串。
export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return prefix + c.randomUUID();
  const rand = () => Math.random().toString(36).slice(2, 10);
  return prefix + Date.now().toString(36) + rand() + rand();
}
