// S01 粘贴文字导入：识别后进入核对页。
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiBlocker, startTextImport } from '../data/session';
import { Sheet } from '../ui/controls';
import { useToast } from '../ui/Toast';

export function PasteTextSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Sheet
      title="粘贴菜谱文字"
      sub="从小红书、公众号复制正文都行，乱一点也没关系"
      onClose={onClose}
      footer={
        <button
          className="btn primary big block"
          disabled={text.trim().length < 4}
          onClick={async () => {
            const why = await aiBlocker();
            if (why) {
              toast(why);
              return;
            }
            startTextImport(text.trim());
            onClose();
            navigate('/import');
          }}
        >
          识别
        </button>
      }
    >
      <textarea
        className="textarea"
        rows={10}
        aria-label="菜谱文字"
        placeholder={'可乐鸡翅\n鸡翅中 8个\n可乐 1罐\n生抽 2勺\n……\n1. 鸡翅焯水\n2. 煎到两面金黄'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="hint">也可以用 iPhone 的“实况文本”：在照片里长按文字，拷贝后粘贴到这里。</span>
    </Sheet>
  );
}
