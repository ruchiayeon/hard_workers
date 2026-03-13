# Hard Workers

RPG 테마의 멀티 AI 에이전트 협업 플랫폼.
에이전트를 만들고, 팀을 구성하고, 미션을 주면 AI들이 알아서 협력합니다.

---

## For Humans

### 이게 뭐예요?

게임처럼 AI 캐릭터(에이전트)를 만들고 팀을 짜서 미션을 수행시키는 앱입니다.

- **에이전트** = AI 캐릭터. 이름, 역할, 성격(시스템 프롬프트), 사용할 LLM을 설정
- **팀** = 팀장 1명 + 팀원 최대 5명. 협업 방식 선택 가능
- **미션** = 팀에게 지시하면 팀장이 계획 → 팀원 실행 → 팀장 종합

### 주요 기능

| 기능 | 설명 |
|------|------|
| 에이전트 관리 | 캐릭터 카드 형태로 생성/수정/삭제. 초상화(PNG) 지원 |
| 팀 구성 | 팀장 + 팀원 선택, 팀 저장/불러오기 |
| 협업 모드 | 🗡️ 개인플레이 / 🤝 같이 논의 / 👑→⚔ 상하관계 |
| 개별 관계 설정 | 팀원 쌍별로 다른 협업 모드 지정 (매트릭스 UI) |
| 미션 실행 | 실시간 스트리밍 출력, 페이즈 표시 (계획→논의→실행→종합) |
| 파일 작업 | 에이전트가 프로젝트 폴더의 파일을 읽고/쓰고/수정 가능 |
| 결과 저장 | 지정 폴더에 마크다운 파일로 자동 저장 |
| LLM 지원 | OpenAI, Anthropic, Gemini, Groq, Ollama, Claude(계정) |

### 협업 모드 상세

| 모드 | 흐름 |
|------|------|
| **Solo** (기본) | 팀장 계획 → 팀원 병렬 실행 → 팀장 종합 |
| **Collaborate** | 팀장 계획 → 팀원 논의 (최대 3라운드, 전원 동의 시 종료) → 실행 → 종합 |
| **Hierarchical** | 팀장 계획 → 상사가 부하에게 지시 → 부하 실행 → 상사 검토 → 팀장 종합 |

팀원 쌍별로 모드를 다르게 설정할 수 있어 혼합 운영도 가능합니다.

### 시작하기

```bash
# 설치
npm install

# 개발 (서버 + 클라이언트 동시 실행)
npm run dev

# 서버만
npm run server    # http://localhost:3456

# 클라이언트만
npm run client    # http://localhost:5173

# 빌드
npm run build
```

### 페이지 구성

| 경로 | 화면 | 설명 |
|------|------|------|
| `/agents` | 에이전트 관리 | 캐릭터 생성/편집/삭제 |
| `/team` | 팀 구성 | 팀장/팀원 선택, 협업 모드 설정 |
| `/run` | 미션 실행 | 프롬프트 입력 → 실시간 결과 스트리밍 |
| `/settings` | 설정 | LLM API 키 관리, 연결 테스트 |

### 데이터 저장 위치

```
~/.hard-workers/hard-workers.db    (SQLite)
~/.hard-workers/credentials.json   (API 키)
```

---

## For AI

### Architecture

```
hard-workers/
├── server/                  # Express 5 backend (port 3456)
│   ├── index.ts             # REST API routes
│   ├── crew/
│   │   ├── runner.ts        # Task orchestration (plan→discuss→execute→synthesize)
│   │   ├── file-tools.ts    # Agent file tools (list/read/write/edit/delete)
│   │   └── agent-terminal.ts
│   ├── db/
│   │   ├── index.ts         # SQLite init + migrations
│   │   ├── agent.repo.ts    # Agent CRUD
│   │   └── team.repo.ts     # Team CRUD
│   ├── llm/
│   │   ├── registry.ts      # Provider factory
│   │   ├── types.ts         # LLMProvider interface, ChatMessage, ToolDef
│   │   └── providers/       # openai, anthropic, gemini, groq, ollama, claude-oauth
│   ├── auth/claude-oauth.ts # Claude CLI credential sync
│   └── settings.ts          # Credential persistence
├── src/                     # React 18 frontend (Vite dev port 5173)
│   ├── App.tsx              # HashRouter routes
│   ├── api.ts               # fetch wrapper for /api/*
│   ├── pages/               # AgentsPage, TeamPage, RunPage, SettingsPage
│   ├── components/
│   │   ├── agent/           # AgentCard, AgentEditor
│   │   ├── team/            # RelationEditor (relation matrix modal)
│   │   └── layout/          # AppShell, Sidebar, TitleBar
│   └── types/               # agent.ts, team.ts, task.ts, settings.ts
├── assets/agents/           # PNG character portraits
├── vite.config.ts           # Proxy /api → localhost:3456
├── tailwind.config.ts       # Dark RPG theme, custom colors/fonts
└── package.json
```

### Tech Stack

- **Frontend:** React 18, TypeScript, Vite 6, Tailwind CSS 3, React Router 7 (HashRouter)
- **Backend:** Express 5, TypeScript (tsx runtime)
- **Database:** SQLite via better-sqlite3, WAL mode
- **LLM SDKs:** @anthropic-ai/sdk, openai, @google/generative-ai (+ groq via openai-compat)
- **Streaming:** Server-Sent Events (SSE) for real-time agent output

### Database Schema

```sql
agents (id, name, role, portrait_file, system_prompt, llm_config JSON, created_at, updated_at)
teams  (id, name, description, leader_id, member_ids JSON, workspace, default_mode, relations JSON, created_at, updated_at)
tasks  (id, team_id, team_name, prompt, status, result, created_at, completed_at)
```

### Key Types

```typescript
type LLMProviderType = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'ollama' | 'claude-oauth'
type RelationMode = 'solo' | 'collaborate' | 'hierarchical'
type RunPhase = 'planning' | 'discussing' | 'executing' | 'synthesizing'

interface MemberRelation { fromId: string; toId: string; mode: RelationMode }
interface Team { ...; defaultMode: RelationMode; relations: MemberRelation[] }
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/api/agents/:id` | Agent CRUD |
| GET/POST/PUT/DELETE | `/api/teams/:id` | Team CRUD |
| POST | `/api/tasks/run` | Execute task (SSE stream) |
| POST | `/api/llm/test` | Test LLM provider connection |
| GET/POST/DELETE | `/api/settings/keys` | API key management |
| POST | `/api/auth/claude/login` | Claude OAuth login |
| POST | `/api/workspace/pick` | Windows folder picker dialog |

### Task Execution Flow (`runner.ts`)

```
runCrew(leader, members, prompt, defaultMode, relations)
  │
  ├─ Phase 1: Leader plans (runAgent with tool-use loop)
  │     └─ parsePlan() → assign subtasks to members
  │
  ├─ groupByMode(members, defaultMode, relations)
  │     ├─ SoloGroup     → Promise.all(member executions)
  │     ├─ CollaborateGroup → discussion rounds → execution
  │     └─ HierarchicalGroup → supervisor instructs → subordinates execute → supervisor reviews
  │
  ├─ Phase 2: Groups execute in parallel (Promise.all)
  │
  └─ Phase 3: Leader synthesizes all results
```

### Agent Tool-Use Loop (`runAgent`)

Each agent runs in a loop (max 40 rounds):
1. LLM generates text + optional tool calls
2. If tool calls → execute file tools → feed results back → repeat
3. If no tool calls → agent is done

File tools (`read_file`, `edit_file`) wait indefinitely (15s poll) for files that don't exist yet, to handle inter-agent file dependencies during parallel execution.

### SSE Event Types

```typescript
{ type: 'stream', taskId, agentId, agentName, agentRole, phase, delta, done }
{ type: 'discussion', taskId, round, maxRounds, status, opinions }
{ type: 'complete', taskId, content, savedPath, completedAt }
{ type: 'error', taskId, message }
```

### UI Theme

- Dark background: `#0d0f1a`
- Accent: `#ffd700` (gold)
- Card frames with border glow effects
- Fonts: Rajdhani (UI), Press Start 2P (pixel headings)
- Korean language interface

---

## License

MIT License. 자유롭게 사용 가능하나, 사용 시 원작자 고지(저작권 문구 포함)가 필수입니다. 자세한 내용은 [LICENSE](./LICENSE) 참조.
