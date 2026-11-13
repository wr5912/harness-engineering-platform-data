window.__ModuleLoader__.load({
  id: 'dsh-security-report-download',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const TOOL = 'export_security_report';
    const NS = 'securityReportDownload';
    const MIME = 'text/html; charset=utf-8';
    const FIELDS = ['schema_version', 'kind', 'session_id', 'file_path', 'filename', 'content_type', 'bytes', 'sha256', 'attachment_id'];
    const dictionaries = {
      zh: {
        inspection: '巡检报告', fault: '故障排查报告', preview: '预览HTML', download: '下载HTML',
        preparing: '正在导出安全报告…', failed: '报告导出失败，未提供预览或下载。',
        invalid: '报告回执不完整，未提供预览或下载。', foreign: '报告不属于此调用会话，已拒绝读取。',
        checking: '正在读取文件并校验完整性…', opened: '已打开原生文件预览。',
        downloadStarted: '已发起HTML下载；请核对浏览器下载结果。',
        readFailed: '报告文件读取失败，请查看调用记录后重试。',
        incomplete: '报告字节不完整或长度不一致，已停止交付。',
        wrongPath: '实际文件路径与报告回执不一致，已停止交付。',
        digestMismatch: '报告SHA-256校验失败，已停止交付。',
        previewFailed: '原生文件预览暂不可用。', downloadFailed: '浏览器下载未能发起，请重试。',
        inspect: '查看调用记录', bytes: '{count} 字节',
      },
      en: {
        inspection: 'Inspection report', fault: 'Fault analysis report', preview: 'Preview HTML', download: 'Download HTML',
        preparing: 'Exporting security report…', failed: 'Report export failed. Preview and download are unavailable.',
        invalid: 'The report receipt is incomplete. Preview and download are unavailable.', foreign: 'This report belongs to another calling session. Reading was refused.',
        checking: 'Reading and verifying the complete report…', opened: 'Opened the native file preview.',
        downloadStarted: 'HTML download initiated. Check your browser downloads.',
        readFailed: 'Could not read the report. Inspect the call before retrying.',
        incomplete: 'Report bytes are incomplete or the byte count differs. Delivery stopped.',
        wrongPath: 'The actual file path differs from the report receipt. Delivery stopped.',
        digestMismatch: 'The report SHA-256 does not match. Delivery stopped.',
        previewFailed: 'The native file preview is unavailable.', downloadFailed: 'The browser download could not start. Please retry.',
        inspect: 'Inspect call', bytes: '{count} bytes',
      },
    };

    function canonical(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.schema_version !== 'security-report/v1'
        || !['inspection', 'fault'].includes(value.kind)
        || typeof value.session_id !== 'string' || !value.session_id
        || typeof value.file_path !== 'string' || !value.file_path.startsWith('/')
        || /[\u0000-\u001f\u007f]/.test(value.file_path) || value.file_path.split('/').some(part => part === '..')
        || typeof value.filename !== 'string' || !/^[^/\\\u0000-\u001f\u007f]+\.html$/.test(value.filename)
        || value.content_type !== MIME || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
        || typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.sha256)
        || value.attachment_id !== `sha256:${value.sha256.toLowerCase()}`
        || !value.source || typeof value.source !== 'object' || Array.isArray(value.source)) return null;
      return { ...value, sha256: value.sha256.toLowerCase() };
    }

    function receiptOf(props) {
      const block = props.block;
      if (props.toolName !== TOOL || props.phase !== 'result' || block?.kind !== 'tool-result'
        || block.name !== TOOL || block.callId !== props.callId || block.isError !== false || block.error) return null;
      let text = null;
      if (block.content?.length === 1 && block.content[0].type === 'text') {
        try { text = canonical(JSON.parse(block.content[0].text)); } catch { /* 非JSON结果不升级为报告回执。 */ }
      }
      if (block.meta !== undefined && block.meta !== null) {
        const meta = canonical(block.meta);
        if (!meta || text && FIELDS.some(key => meta[key] !== text[key])) return null;
        return meta;
      }
      return text;
    }

    // HTTP局域网页面没有WebCrypto时仍校验SHA-256；不依赖下载服务或外部脚本。
    function sha256Fallback(data) {
      const k = [
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
      ];
      const state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
      const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
      padded.set(data); padded[data.length] = 0x80;
      const view = new DataView(padded.buffer), words = new Uint32Array(64);
      view.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000));
      view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
      const rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
      for (let offset = 0; offset < padded.length; offset += 64) {
        for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
          const x = words[i - 15], y = words[i - 2];
          words[i] = (words[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3))
            + words[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) >>> 0;
        }
        let [a,b,c,d,e,f,g,j] = state;
        for (let i = 0; i < 64; i++) {
          const first = (j + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + words[i]) >>> 0;
          const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
          j = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
        }
        const values = [a,b,c,d,e,f,g,j];
        for (let i = 0; i < 8; i++) state[i] = (state[i] + values[i]) >>> 0;
      }
      return Array.from(state, value => value.toString(16).padStart(8, '0')).join('');
    }

    async function digest(data) {
      if (!globalThis.crypto?.subtle) return sha256Fallback(data);
      const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
    }

    const sessionIdentity = snapshot => snapshot.sessionId;
    const sessionRemoved = snapshot => snapshot.removed;
    const buttonStyle = {
      padding: '4px 10px', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 8,
      background: 'var(--dsw-alias-bg-base)', color: 'inherit', font: 'inherit', cursor: 'pointer',
    };

    return {
      inject: ['slots', 'locale', 'remote', 'remote.workspaceFiles'],
      apply(ctx) {
        for (const [language, dictionary] of Object.entries(dictionaries)) {
          ctx.effect(() => ctx.locale.register(NS, language, dictionary));
        }
        function SecurityReportTool(props) {
          const { t } = props;
          const sessionId = props.useSession(sessionIdentity);
          const removed = props.useSession(sessionRemoved);
          const receipt = React.useMemo(() => receiptOf(props), [props.toolName, props.phase, props.block, props.callId]);
          const bound = receipt && !removed && props.sessionId === sessionId && receipt.session_id === sessionId;
          const key = bound ? JSON.stringify(FIELDS.map(field => receipt[field])) : null;
          const lifetime = React.useRef(null);
          const anchor = React.useRef(null);
          const [view, setView] = React.useState({ key: null });
          React.useEffect(() => {
            const owner = { key, disposed: false, controller: null, url: null, clicked: null };
            lifetime.current = owner;
            setView({ key });
            return () => {
              owner.disposed = true;
              owner.controller?.abort();
              if (owner.url) URL.revokeObjectURL(owner.url);
            };
          }, [key]);
          React.useEffect(() => {
            const owner = lifetime.current;
            if (!view.url || view.key !== key || owner?.disposed || owner?.key !== key
              || owner.url !== view.url || owner.clicked === view.url || !anchor.current) return;
            owner.clicked = view.url;
            try {
              anchor.current.click();
              setView(current => current.key === key && current.url === view.url
                ? { ...current, status: 'downloadStarted' } : current);
            } catch { setView(current => ({ ...current, status: null, error: 'downloadFailed' })); }
          }, [view.url, view.key, key]);

          async function perform(action) {
            const owner = lifetime.current;
            if (!bound || !key || owner?.disposed || owner?.key !== key || owner.controller) return;
            const controller = new AbortController();
            owner.controller = controller;
            const current = () => !owner.disposed && lifetime.current === owner && !controller.signal.aborted;
            setView({ key, busy: true, url: owner.url });
            try {
              const reply = await ctx.remote.workspaceFiles.readBytes(sessionId, receipt.file_path, {}, controller.signal);
              if (!current()) return;
              if (reply?.ok !== true) throw new Error('readFailed');
              const file = reply.value;
              if (!file || !(file.data instanceof Uint8Array) || file.offset !== 0 || file.eof !== true
                || file.data.byteLength !== receipt.bytes || file.bytes !== undefined && file.bytes !== receipt.bytes) throw new Error('incomplete');
              if (file.absolutePath !== receipt.file_path) throw new Error('wrongPath');
              if (await digest(file.data) !== receipt.sha256) throw new Error('digestMismatch');
              if (!current()) return;
              if (action === 'preview') {
                try { props.openFile(receipt.file_path); } catch { throw new Error('previewFailed'); }
                setView({ key, url: owner.url, status: 'opened' });
              } else {
                if (owner.url) { URL.revokeObjectURL(owner.url); owner.url = null; }
                owner.url = URL.createObjectURL(new Blob([file.data], { type: MIME }));
                setView({ key, url: owner.url });
              }
            } catch (error) {
              const errorKey = error instanceof Error && Object.hasOwn(dictionaries.en, error.message) ? error.message : 'readFailed';
              if (current()) setView({ key, url: owner.url, error: errorKey });
            } finally {
              if (owner.controller === controller) owner.controller = null;
            }
          }

          const inspection = typeof props.inspect === 'function'
            ? h('button', { type: 'button', style: buttonStyle, onClick: props.inspect }, t('inspect')) : null;
          const warning = props.phase !== 'result' ? 'preparing'
            : props.block?.isError || props.block?.error ? 'failed' : !receipt ? 'invalid' : !bound ? 'foreign' : null;
          if (warning) return h('div', { role: 'status', style: { margin: '6px 0', fontSize: 13 } }, t(warning), ' ', inspection);
          const active = view.key === key ? view : {};
          return h('section', {
            'aria-label': t(receipt.kind), 'data-security-report': receipt.kind,
            style: { margin: '6px 0', color: 'var(--dsw-alias-label-primary)', fontSize: 13, lineHeight: 1.6 },
          },
          h('div', null, h('strong', null, t(receipt.kind)), ' · ', receipt.filename, ' · ', t('bytes', { count: receipt.bytes })),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 } },
            h('button', { type: 'button', style: buttonStyle, disabled: !!active.busy, onClick: () => void perform('preview') }, t('preview')),
            h('button', { type: 'button', style: buttonStyle, disabled: !!active.busy, onClick: () => void perform('download') }, t('download')),
            inspection),
          active.url && h('a', { ref: anchor, href: active.url, download: receipt.filename, hidden: true, tabIndex: -1, 'aria-hidden': true }),
          h('div', { role: 'status', 'aria-live': 'polite' }, active.busy ? t('checking') : active.status ? t(active.status) : null),
          active.error && h('div', { role: 'alert', style: { color: 'var(--dsw-alias-state-error-primary)' } }, t(active.error)));
        }
        ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview', key: TOOL, locale: NS,
        }, SecurityReportTool)));
      },
    };
  },
});
