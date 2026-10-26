// 选图：iPhone 上会弹出"照片图库 / 拍照 / 选取文件"。最多 4 张。
import { useRef, useState } from 'react';
import { useSettings } from '../data/hooks';
import { aiBlockerFor, MAX_IMAGES } from '../data/session';
import { useToast } from './Toast';

export function useImagePicker(onPick: (files: File[]) => Promise<void>) {
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const settings = useSettings();
  const [busy, setBusy] = useState(false);

  // iPhone 只允许在点击的那一刻打开选图，中间不能有 await，所以用已经读好的设置同步检查
  function open() {
    const why = aiBlockerFor(settings);
    if (why) {
      toast(why);
      return;
    }
    ref.current?.click();
  }

  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      multiple
      hidden
      onChange={async (e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (!files.length) return;
        if (files.length > MAX_IMAGES) toast(`一次最多 ${MAX_IMAGES} 张，先用前 ${MAX_IMAGES} 张`);
        setBusy(true);
        try {
          await onPick(files);
        } catch (err) {
          toast('图片读不出来，换一张试试：' + String((err as Error).message ?? err));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
  return { input, open, busy };
}
