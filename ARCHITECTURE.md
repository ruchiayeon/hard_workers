# Hard Workers - Architecture & Sequence Diagrams

## System Architecture

```mermaid
graph TB
    subgraph Client["Frontend (React + Vite :5173)"]
        App[App.tsx<br/>HashRouter]
        Pages["Pages"]
        API[api.ts<br/>HTTP Client]

        App --> Pages
        Pages --> API

        subgraph PageList["Pages"]
            P1[AgentsPage]
            P2[TeamPage]
            P3[RunPage]
            P4[SettingsPage]
        end
    end

    subgraph Server["Backend (Express :3456)"]
        Routes[index.ts<br/>REST API Routes]

        subgraph Crew["crew/"]
            Runner[runner.ts<br/>Task Orchestration]
            FileTools[file-tools.ts<br/>Agent File Tools]
            Terminal[agent-terminal.ts]
        end

        subgraph LLM["llm/"]
            Registry[registry.ts<br/>Provider Factory]
            subgraph Providers["providers/"]
                OpenAI[OpenAI]
                Anthropic[Anthropic]
                Gemini[Gemini]
                Groq[Groq]
                Ollama[Ollama]
                ClaudeOAuth[Claude OAuth]
            end
        end

        subgraph DB["db/"]
            DBInit[index.ts<br/>SQLite Init]
            AgentRepo[agent.repo.ts]
            TeamRepo[team.repo.ts]
        end

        Auth[auth/claude-oauth.ts]
        Settings[settings.ts<br/>Credentials]
    end

    subgraph Storage["Storage (~/.hard-workers/)"]
        SQLite[(hard-workers.db<br/>SQLite WAL)]
        Creds[credentials.json]
    end

    subgraph External["External LLM APIs"]
        OpenAIAPI[OpenAI API]
        AnthropicAPI[Anthropic API]
        GeminiAPI[Gemini API]
        GroqAPI[Groq API]
        OllamaLocal[Ollama Local]
    end

    API -->|REST + SSE| Routes
    Routes --> Runner
    Routes --> DB
    Routes --> Settings
    Routes --> Auth
    Runner --> Registry
    Runner --> FileTools
    Registry --> Providers
    DB --> SQLite
    Settings --> Creds

    OpenAI -->|API Call| OpenAIAPI
    Anthropic -->|API Call| AnthropicAPI
    Gemini -->|API Call| GeminiAPI
    Groq -->|API Call| GroqAPI
    Ollama -->|Local| OllamaLocal
```

## Database Schema

```mermaid
erDiagram
    agents {
        TEXT id PK
        TEXT name
        TEXT role
        TEXT portrait_file
        TEXT system_prompt
        JSON llm_config
        TEXT created_at
        TEXT updated_at
    }

    teams {
        TEXT id PK
        TEXT name
        TEXT description
        TEXT leader_id FK
        JSON member_ids
        TEXT workspace
        TEXT default_mode
        JSON relations
        TEXT created_at
        TEXT updated_at
    }

    tasks {
        TEXT id PK
        TEXT team_id FK
        TEXT team_name
        TEXT prompt
        TEXT status
        TEXT result
        TEXT created_at
        TEXT completed_at
    }

    teams ||--o{ agents : "leader_id"
    teams ||--o{ tasks : "team_id"
    agents }o--o{ teams : "member_ids (JSON)"
```

## Task Execution Sequence

```mermaid
sequenceDiagram
    actor User
    participant UI as RunPage
    participant API as Express API
    participant Runner as runner.ts
    participant Leader as Leader Agent
    participant LLM as LLM Provider
    participant Members as Member Agents
    participant FS as File System

    User->>UI: Enter prompt & click execute
    UI->>API: POST /api/tasks/run
    API->>Runner: runCrew(leader, members, prompt)

    Note over Runner: Phase 1: Planning
    Runner->>Leader: Plan task
    Leader->>LLM: streamChat(prompt + member info)
    LLM-->>Leader: Plan with subtask assignments
    Leader-->>Runner: Parsed plan (subtasks → agents)
    Runner-->>UI: SSE: {type: stream, phase: planning}

    Note over Runner: Phase 2: Group by Mode
    Runner->>Runner: groupByMode(members, defaultMode, relations)

    alt Solo Mode
        Runner->>Members: Execute all in parallel
        Members->>LLM: streamChat(subtask)
        LLM-->>Members: Response
        Members-->>Runner: Results
    else Collaborate Mode
        loop Discussion (max 3 rounds)
            Runner->>Members: Request opinions
            Members->>LLM: streamChat(topic)
            LLM-->>Members: Opinion + [AGREE/DISAGREE]
            Members-->>Runner: Opinions
            Runner-->>UI: SSE: {type: discussion, round, opinions}
        end
        Runner->>Members: Execute with consensus
        Members->>LLM: streamChat(final task)
        LLM-->>Members: Response
        Members-->>Runner: Results
    else Hierarchical Mode
        Runner->>Members: Supervisor creates instructions
        Members->>LLM: Subordinates execute
        LLM-->>Members: Results
        Members->>LLM: Supervisor reviews
        LLM-->>Members: Review
        Members-->>Runner: Final results
    end

    Runner-->>UI: SSE: {type: stream, phase: executing}

    Note over Runner: Phase 3: Synthesis
    Runner->>Leader: Synthesize all results
    Leader->>LLM: streamChat(all member outputs)
    LLM-->>Leader: Final answer
    Leader-->>Runner: Synthesized result
    Runner->>FS: Save markdown to workspace
    Runner-->>UI: SSE: {type: complete, content, savedPath}
    UI-->>User: Display final result
```

## Agent Tool-Use Loop

```mermaid
sequenceDiagram
    participant Runner as runner.ts
    participant Agent as Agent
    participant LLM as LLM Provider
    participant Tools as file-tools.ts
    participant FS as File System

    Runner->>Agent: runAgent(agent, phase, messages, tools)

    loop Max 40 rounds
        Agent->>LLM: streamChat(messages, FILE_TOOLS)
        LLM-->>Agent: Response (text + tool_calls?)

        alt Has tool calls
            loop Each tool call
                Agent->>Tools: executeFileTool(name, input, workDir)

                alt read_file / edit_file (file not found)
                    loop Poll every 15s
                        Tools->>FS: Check file exists
                        FS-->>Tools: Not found
                    end
                    Tools->>FS: File found
                    FS-->>Tools: Content
                end

                alt write_file
                    Tools->>FS: Write content
                    FS-->>Tools: Success
                end

                Tools-->>Agent: Tool result
            end
            Agent->>Agent: Add tool results to messages
        else No tool calls
            Agent-->>Runner: Final output text
        end
    end
```

## SSE Streaming Flow

```mermaid
sequenceDiagram
    participant UI as RunPage (React)
    participant Fetch as fetch API
    participant Server as Express SSE
    participant Runner as runner.ts

    UI->>Fetch: POST /api/tasks/run
    Fetch->>Server: HTTP Request
    Server->>Server: Set headers (text/event-stream)
    Server->>Runner: Start runCrew()

    par Keepalive
        loop Every 15s
            Server-->>Fetch: : keepalive\n\n
        end
    and Task Execution
        Runner-->>Server: onEvent(stream)
        Server-->>Fetch: data: {"type":"stream","phase":"planning","delta":"..."}\n\n
        Fetch-->>UI: Parse & update state

        Runner-->>Server: onEvent(discussion)
        Server-->>Fetch: data: {"type":"discussion","round":1,"opinions":[...]}\n\n
        Fetch-->>UI: Show discussion UI

        Runner-->>Server: onEvent(stream)
        Server-->>Fetch: data: {"type":"stream","phase":"executing","delta":"..."}\n\n
        Fetch-->>UI: Append agent output

        Runner-->>Server: onEvent(complete)
        Server-->>Fetch: data: {"type":"complete","content":"...","savedPath":"..."}\n\n
        Fetch-->>UI: Display final result
    end
```

## Team Grouping Algorithm

```mermaid
flowchart TD
    Start([groupByMode called]) --> Input[/"members[], defaultMode, relations[]"/]
    Input --> CheckRelations{Has custom<br/>relations?}

    CheckRelations -->|No| DefaultAll["All members → defaultMode group"]
    CheckRelations -->|Yes| ProcessRelations["Process each relation"]

    ProcessRelations --> CheckMode{Relation mode?}

    CheckMode -->|solo| SoloGroup["Add to Solo group<br/>(independent execution)"]
    CheckMode -->|collaborate| UnionFind["Union-Find merge<br/>connected agents"]
    CheckMode -->|hierarchical| HierGroup["Create Hierarchical pair<br/>(supervisor → subordinate)"]

    UnionFind --> CollabGroups["Connected components<br/>= Collaborate groups"]

    SoloGroup --> Remaining{Unassigned<br/>members?}
    CollabGroups --> Remaining
    HierGroup --> Remaining
    DefaultAll --> Execute

    Remaining -->|Yes| AssignDefault["Assign to defaultMode group"]
    Remaining -->|No| Execute
    AssignDefault --> Execute

    Execute([Execute all groups in parallel])

    subgraph Solo["Solo Execution"]
        S1[Agent 1] -.-> S1R[Result 1]
        S2[Agent 2] -.-> S2R[Result 2]
        S3[Agent 3] -.-> S3R[Result 3]
    end

    subgraph Collab["Collaborate Execution"]
        D1[Discussion Round 1] --> D2[Discussion Round 2]
        D2 --> DCheck{All agree?}
        DCheck -->|Yes| CExec[Execute]
        DCheck -->|No| D3[Discussion Round 3]
        D3 --> CExec
    end

    subgraph Hier["Hierarchical Execution"]
        Sup[Supervisor] -->|instruct| Sub1[Subordinate 1]
        Sup -->|instruct| Sub2[Subordinate 2]
        Sub1 -->|result| SupR[Supervisor Review]
        Sub2 -->|result| SupR
    end

    Execute -.-> Solo
    Execute -.-> Collab
    Execute -.-> Hier
```

## Frontend Route & Component Structure

```mermaid
graph LR
    subgraph App["App.tsx (HashRouter)"]
        subgraph Layout["AppShell"]
            Sidebar[Sidebar<br/>Navigation]
            TitleBar[TitleBar<br/>Window Controls]
        end

        subgraph Routes["Routes"]
            R1["/agents"]
            R2["/team"]
            R3["/run"]
            R4["/settings"]
        end

        R1 --> AgentsPage
        R2 --> TeamPage
        R3 --> RunPage
        R4 --> SettingsPage
    end

    subgraph AgentsPage["AgentsPage"]
        AgentCards[AgentCard Grid]
        AgentEditor[AgentEditor Modal]
    end

    subgraph TeamPage["TeamPage"]
        LeaderSelect[Leader Selection]
        MemberSelect[Member Selection]
        RelationEditor[RelationEditor Modal<br/>Mode Matrix]
    end

    subgraph RunPage["RunPage"]
        PromptInput[Prompt Input]
        StreamView[Streaming Output View]
        PhaseIndicator[Phase Indicator]
    end

    subgraph SettingsPage["SettingsPage"]
        KeyManager[API Key Manager]
        ConnTest[Connection Test]
    end

    subgraph APILayer["api.ts"]
        AgentAPI[api.agent]
        TeamAPI[api.team]
        TaskAPI[api.task]
        SettingsAPI[api.settings]
    end

    AgentsPage --> AgentAPI
    TeamPage --> TeamAPI
    RunPage --> TaskAPI
    SettingsPage --> SettingsAPI

    APILayer -->|"fetch /api/*"| Backend["Express :3456"]
```
