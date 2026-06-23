# Codex Helper (작업실)

> 터미널 없이 쓰는 Codex 런처/채팅 GUI — 비개발자를 위한 더블클릭 기반 AI 작업실.

ChatGPT Plus(월 2만원대) 구독자인데 터미널·로그인·명령어 문턱 때문에 Codex를 못 쓰는 사람을 위해,
**ZIP 받아 → `작업실.exe` 더블클릭 → (처음이면) 자동 준비 + 로그인 → 채팅으로 AI에게 내 PC 작업을 시키는** 데스크톱 앱.

## 핵심 컨셉
- **다운 → 더블클릭 → 끝**: 처음 실행 시 설치도우미가 Node·Codex를 알아서 준비, 이후엔 더블클릭으로 바로 기동
- **비번 미저장 로그인**: 공식 OpenAI OAuth 페이지만 열고 완료 여부만 감지 (`~/.codex/auth.json`)
- **채팅 UI**: 터미널 로그 대신 채팅창 + 쉬운 한국어 안내
- **기능 모델**: ① 메이커가 준비한 프리셋 기능 ② 사용자가 직접 등록한 기능 ③ 채팅으로 호출
- **PC제어**: 선택 폴더 파일 작업 + 셸 명령/프로그램 실행 (GUI 마우스 자동화는 기본 아님)
- **안전모드 게이트**: 기본 read-only(계획만), 수정/실행은 사용자 승인 후 + 백업/되돌리기

## 설치 노선 (확정)
- **앱 본체**: 포터블 (ZIP 압축 풀고 더블클릭)
- **AI 엔진(Node·Codex)**: 전역설치 (winget/공식설치 + PATH 등록) → 일반 터미널에서도 `codex` 동작 + 로그인 공유
- 트레이드오프 보완: 깔끔한 제거용 **언인스톨러("정리하기")** 제공 (M6)

## 기술 스택
- Electron + React (PasteMotion 패키징/CI 자산 재활용)
- child process로 `codex exec --json` 호출 (대화형 필요시 node-pty)
- 멀티턴: Codex 세션 resume으로 문맥 유지
- 로컬 상태: `data/`(settings·logs·backups·sessions), 비번 미저장, Codex/Node v1 미번들

## 마일스톤
M0 수요검증 → **M1 코어 래퍼 PoC** → M2 로그인·세션 → M3 설치도우미 → M4 안전모드 → M5 프리셋 버튼 → M6 포터블 배포(+언인스톨러) → M7 베타·유료화

상세: [docs/milestones.md](docs/milestones.md) · 기획서: [docs/product-plan.md](docs/product-plan.md)

## 현재 상태
기획·타당성 검증 완료(2026-06-23). M1 착수 준비 — 착수 전 `codex exec --json` 출력 포맷 등 4개 스파이크 실측 예정.
