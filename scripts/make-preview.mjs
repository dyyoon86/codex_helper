// dist/index.html → dist/preview.html : window.codex mock + 자동 구동 스크립트 주입(스크린샷용)
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const DRIVE = process.argv[2] !== 'welcome' // 'welcome' 인자 주면 자동구동 끄고 시작화면만
const OUT = DRIVE ? 'preview.html' : 'preview-welcome.html'
let html = readFileSync(join(dist, 'index.html'), 'utf-8')
// 미리보기(캡처)용: CSP 메타 제거 → inline mock 스크립트 허용
html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/i, '')

const mock = `<script>
(function () {
  var now = Math.floor(Date.now() / 1000);
  window.codex = {
    _cb: null,
    selectFolder: async function () { return 'C:\\\\Users\\\\dyyoon\\\\Documents\\\\분기보고서'; },
    checkCodex: async function () { return { installed: true, loggedIn: true, version: 'codex-cli 0.141.0' }; },
    getLatestUsage: async function () {
      return { planType: 'plus', totalTokens: 12285, contextWindow: 258400,
        primary: { usedPercent: 6, windowMinutes: 300, resetsAt: now + 3 * 3600 },
        secondary: { usedPercent: 56, windowMinutes: 10080, resetsAt: now + 4 * 86400 } };
    },
    onStream: function (cb) { window.codex._cb = cb; return function () { window.codex._cb = null; }; },
    runCodex: async function (req, runId) {
      var cb = window.codex._cb;
      if (cb) cb({ runId: runId, kind: 'progress', text: '폴더 살펴보는 중…' });
      await new Promise(function (r) { setTimeout(r, 200); });
      var msg = '이 폴더에는 파일 8개가 있어요.\\n\\n' +
        '• 2026_1분기_매출.xlsx — 분기 매출 정리표\\n' +
        '• 회의록_0312.docx — 3월 정기회의 기록\\n' +
        '• 제안서_초안.pptx — 고객사 제안 발표자료\\n' +
        '• images/ (사진 4장)\\n\\n' +
        '수정은 하지 않고 설명만 했어요. 정리나 요약이 필요하면 말씀해 주세요 🙂';
      if (cb) cb({ runId: runId, kind: 'message', text: msg });
      if (cb) cb({ runId: runId, kind: 'usage', usage: { input_tokens: 13120, output_tokens: 142 } });
      return { code: 0, threadId: 'demo', finalMessage: msg,
        usage: { planType: 'plus', totalTokens: 13262, contextWindow: 258400,
          primary: { usedPercent: 7, windowMinutes: 300, resetsAt: now + 3 * 3600 },
          secondary: { usedPercent: 57, windowMinutes: 10080, resetsAt: now + 4 * 86400 } } };
    }
  };
  function setNativeValue(el, value) {
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (!${DRIVE}) return;
  var step = 0;
  var timer = setInterval(function () {
    var fb = document.querySelector('.folder-btn');
    if (step === 0 && fb) { fb.click(); step = 1; return; }
    var ta = document.querySelector('.composer textarea');
    if (step === 1 && ta && !ta.disabled) { setNativeValue(ta, '이 폴더 설명해줘'); step = 2; return; }
    var s = document.querySelector('.send');
    if (step === 2 && s && !s.disabled) { s.click(); step = 3; return; }
    if (step === 3 && document.querySelector('.bubble.assistant .text')) { clearInterval(timer); window.__ready = true; }
  }, 80);
})();
</script>`

html = html.replace('<script type="module"', mock + '\n    <script type="module"')
writeFileSync(join(dist, OUT), html)
console.log(OUT + ' 생성됨')
