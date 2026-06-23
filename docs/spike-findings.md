# M1 착수 전 스파이크 실측 결과 (2026-06-23)

환경: codex-cli **0.141.0** (`~/.hermes/node/bin/codex`), 기존 ChatGPT OAuth(`~/.codex/auth.json`) 사용.

## 1. `codex exec --json` 출력 포맷 ✅

호출:
```bash
codex exec --json --skip-git-repo-check -s read-only "<프롬프트>" < /dev/null
```
- **주의**: 프롬프트를 positional 인자로 줘도 stdin을 추가로 읽으려 해서 멈춤 → **`< /dev/null`로 stdin 닫아야 함** (앱에서는 stdin 파이프 명시 종료).
- stdout = **JSONL 이벤트 스트림**, stderr = 진행 로그.

실측 출력(stdout):
```jsonl
{"type":"thread.started","thread_id":"019ef1e6-...-ecbefc1f2db9"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"hello"}}
{"type":"turn.completed","usage":{"input_tokens":12294,"cached_input_tokens":10112,"output_tokens":5,"reasoning_output_tokens":0}}
```

파서 설계:
- `thread.started.thread_id` → **세션 id로 보관**(멀티턴 resume용)
- `item.completed` + `item.type=="agent_message"` → **채팅 버블 텍스트** (그 외 item.type: 도구사용/파일변경 등은 진행표시로)
- `turn.completed.usage` → 토큰 사용량 표시/로깅
- 방어적 파싱: 알 수 없는 `type`은 무시(버전업 대비)

## 2. 멀티턴(세션 resume) ✅

```bash
codex exec resume "<thread_id>" --json --skip-git-repo-check "<다음 프롬프트>" < /dev/null
```
- 직전 턴 문맥 유지 확인 ("방금 말한 단어?" → "hello" 정답).
- **주의**: `resume` 서브커맨드는 옵션 형태가 다름 — `-s/--sandbox` **안 받음**(`error: unexpected argument '-s'`). 샌드박스는 `-c sandbox_mode=...`(config) 또는 기본값. 첫 턴은 `codex exec -s read-only`, 이후 턴은 `codex exec resume <id>` + 필요시 `-c`.
- `--last`로 가장 최근 세션 자동 선택도 가능.

## 3. 안전모드(sandbox) ✅
`-s, --sandbox <read-only | workspace-write | danger-full-access>` (codex exec 기준)
- **기본 = `read-only`** → "계획만 보여주기"에 매핑 (파일 수정/실행 차단)
- 사용자 승인 후 작업 = `workspace-write`
- `--dangerously-bypass-approvals-and-sandbox`는 사용 안 함(위험)
- `--skip-git-repo-check` = 세션파일 디스크 미저장 + git 레포 아니어도 실행(임의 폴더 대상)
- `--output-schema <FILE>` = 구조화 출력(프리셋 기능에서 결과 파싱할 때 유용)

## 4. 로그인 ✅
- 기존 `~/.codex/auth.json` 존재 → 별도 로그인 없이 동작.
- 앱: `codex --version`(설치) + auth.json 존재(로그인) 점검 → 없으면 `codex login`(브라우저 OAuth) 트리거 후 auth.json 생성 폴링.
- 윈도우 경로: `%USERPROFILE%\.codex\auth.json` (전역설치라 터미널 codex와 공유).

---

## 결론 — M1 통합 인터페이스 확정
1. 1턴: `codex exec --json --skip-git-repo-check -s read-only "<prompt>" < /dev/null` → JSONL 파싱 → 채팅
2. thread_id 보관 → 다음 턴 `codex exec resume <thread_id> --json ...`
3. 수정 작업 = 사용자 승인 시 `-s workspace-write`(첫 턴) / `-c`(resume)
4. `agent_message`=버블, 그 외 item=진행표시, `usage`=토큰
→ M1(코어 래퍼)·M2(세션)·M4(안전모드) 설계 확정. node-pty 불필요(child_process로 충분).
