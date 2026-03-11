# Crew Builder - Architecture Structure

## Overview

Electron 33 + React 18 + TypeScript 데스크톱 앱.
RPG 게임 스타일 UI로 AI 에이전트 팀을 구성하고 협업 태스크를 실행하는 도구.

```
post_agent/
├── electron/          # Main Process (Node.js)
├── src/               # Renderer Process (React)
├── server/            # Express 서버 (미사용/실험적)
├── assets/            # 정적 리소스
├── scripts/           # 빌드/패치 스크립트
├── dist/              # Vite 빌드 출력
└── dist-electron/     # Electron 빌드 출력
```

---

## Tech Stack

| 영역 | 기술 |
|------|------|
| 프레임워크 | Electron 33 |
| 프론트엔드 | React 18 + TypeScript + Vite 6 |
| 스타일링 | Tailwind CSS 3 |
| 라우팅 | react-router-dom 7 (HashRouter) |
| DB | better-sqlite3 (SQLite, WAL mode) |
| LLM SDK | @anthropic-ai/sdk, openai, @google/generative-ai |

---

## Main Process (`electron/`)

Electron 메인 프로세스. DB, LLM, IPC 핸들러를 관리한다.

```
electron/
├── main.ts                  # 앱 진입점, 윈도우 생성, 초기화
├── preload.ts               # contextBridge (IPC 노출)
├── ipc/
│   └── index.ts             # 모든 IPC 핸들러 등록
│                              - agent:list/get/create/update/delete
│                              - team:list/get/save/delete
│                              - task:list/run
│                              - llm:test
│                              - settings:get-keys/set-key/clear-key
├── db/
│   ├── index.ts             # SQLite 연결 & 마이그레이션
│   ├── agent.repo.ts        # Agent CRUD
│   ├── team.repo.ts         # Team CRUD
│   └── task.repo.ts         # Task CRUD
├── llm/
│   ├── types.ts             # LLMProvider 인터페이스, ChatMessage
│   ├── registry.ts          # LLMRegistry 싱글턴 (프로바이더 팩토리)
│   └── providers/
│       ├── openai.provider.ts
│       ├── anthropic.provider.ts
│       ├── gemini.provider.ts
│       ├── groq.provider.ts
│       ├── ollama.provider.ts
│       └── claude-cookie.provider.ts
├── crew/
│   └── runner.ts            # 태스크 오케스트레이션 (plan → execute → synthesize)
└── utils/
    └── keystore.ts          # API 키 암호화 저장/로드
```

### Crew Runner 흐름 (`crew/runner.ts`)

```
1. Planning   → 리더 에이전트가 태스크 분석 & 서브태스크 JSON 생성
2. Executing  → 멤버 에이전트들이 서브태스크를 병렬 실행
3. Synthesize → 리더가 멤버 결과를 종합하여 최종 답변 생성
```

멤버가 없으면 리더가 단독 실행. 모든 단계에서 `task:stream` IPC로 실시간 스트리밍.

---

## Renderer Process (`src/`)

React 프론트엔드. 다크 RPG 테마 (배경 `#0d0f1a`, 액센트 `#ffd700`).

```
src/
├── main.tsx                     # ReactDOM 엔트리
├── App.tsx                      # HashRouter + 라우트 정의
├── index.css                    # Tailwind + 글로벌 스타일
├── components/
│   ├── agent/
│   │   ├── AgentCard.tsx        # 에이전트 카드 (초상화 + glow 효과)
│   │   └── AgentEditor.tsx      # 에이전트 생성/수정 폼
│   └── layout/
│       ├── AppShell.tsx         # 메인 레이아웃 (사이드바 + 콘텐츠)
│       ├── Sidebar.tsx          # 네비게이션 사이드바
│       └── TitleBar.tsx         # 커스텀 타이틀바 (frame: false)
├── pages/
│   ├── AgentsPage.tsx           # 에이전트 목록/관리
│   ├── TeamPage.tsx             # 팀 구성
│   ├── RunPage.tsx              # 태스크 실행 & 스트리밍 뷰
│   └── SettingsPage.tsx         # API 키 설정
└── types/
    ├── agent.ts                 # Agent, LLMConfig, LLMProviderType
    ├── team.ts                  # Team, ResolvedTeam
    ├── task.ts                  # Task, StreamChunk, AgentRun
    ├── settings.ts              # ProviderCredentials
    └── electron.d.ts            # window.electronAPI 타입 선언
```

### 라우트

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/agents` | AgentsPage | 에이전트 CRUD |
| `/team` | TeamPage | 팀 구성 (리더 + 멤버) |
| `/run` | RunPage | 태스크 입력 & 실행 결과 스트리밍 |
| `/settings` | SettingsPage | LLM 프로바이더 API 키 관리 |

---

## Database Schema (SQLite)

### `agents`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 에이전트 이름 |
| role | TEXT | 역할 (예: "연구원", "작가") |
| portrait_file | TEXT | 초상화 파일명 |
| system_prompt | TEXT | 시스템 프롬프트 |
| llm_config | TEXT (JSON) | `{provider, model, temperature, maxTokens}` |
| created_at | INTEGER | 생성 timestamp |
| updated_at | INTEGER | 수정 timestamp |

### `teams`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT | 팀 이름 |
| description | TEXT | 설명 |
| leader_id | TEXT | 리더 에이전트 ID |
| member_ids | TEXT (JSON) | 멤버 에이전트 ID 배열 |
| created_at | INTEGER | 생성 timestamp |
| updated_at | INTEGER | 수정 timestamp |

### `tasks`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| team_id | TEXT | 팀 ID |
| team_name | TEXT | 팀 이름 |
| prompt | TEXT | 사용자 프롬프트 |
| status | TEXT | pending / running / completed / failed |
| result | TEXT | 최종 결과 |
| created_at | INTEGER | 생성 timestamp |
| completed_at | INTEGER | 완료 timestamp |

### `agent_runs`
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | TEXT PK | UUID |
| task_id | TEXT FK | tasks.id |
| agent_id | TEXT | 에이전트 ID |
| agent_name | TEXT | 에이전트 이름 |
| agent_role | TEXT | leader / member |
| subtask | TEXT | 할당된 서브태스크 |
| output | TEXT | 에이전트 출력 |
| status | TEXT | idle / streaming / done / error |
| phase | TEXT | planning / executing / synthesizing |

---

## LLM Providers

| Provider | 인증 | 모델 예시 |
|----------|------|-----------|
| OpenAI | API Key | gpt-4o, gpt-4o-mini |
| Anthropic | API Key | claude-opus-4-6, claude-sonnet-4-6 |
| Gemini | API Key | gemini-2.0-flash, gemini-1.5-pro |
| Groq | API Key | llama-3.3-70b-versatile |
| Ollama | 로컬 (URL) | llama3.2, mistral |
| Claude Cookie | Session Key | claude-opus-4-6 (비공식) |

모든 LLM 호출은 Main Process에서 실행 (CORS 우회, 키 보안).

---

## IPC 통신 구조

```
Renderer (React)                    Main (Electron)
     │                                    │
     ├── invoke('agent:list') ──────────► agentRepo.list()
     ├── invoke('task:run', data) ──────► runCrew() 시작
     │                                    │
     │  ◄── on('task:stream', chunk) ──── 실시간 스트리밍
     │  ◄── on('task:complete', result) ─ 최종 결과
     │  ◄── on('task:error', err) ─────── 에러 알림
```

---

## 빌드 & 개발 명령어

```bash
# 개발 (Vite + Electron 동시 실행)
npx concurrently "npx vite" "npx wait-on tcp:5173 && npx electron ."

# Vite 개발서버만
npm run dev

# 프로덕션 빌드
npx vite build && npx electron .

# 패키징
npm run electron:build
```

---

## 정적 리소스

```
assets/
└── agents/
    ├── character1.png    # 에이전트 초상화 1
    └── character2.png    # 에이전트 초상화 2
```
