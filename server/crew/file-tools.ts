/**
 * File tools that agents can use to work within a project folder
 */
import fs from 'fs'
import path from 'path'

const IGNORE_DIRS = new Set(['node_modules', '.git', '__pycache__', '.next', 'dist', '.cache', '.venv', 'venv'])
const MAX_FILE_SIZE = 100 * 1024 // 100KB

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export interface ToolResult {
  content: string
  isError?: boolean
}

/** Tool definitions for Anthropic API format */
export const FILE_TOOLS: ToolDefinition[] = [
  {
    name: 'list_files',
    description: '지정 폴더의 파일/디렉토리 목록을 트리 형태로 반환합니다. depth로 깊이를 제한할 수 있습니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '탐색할 경로 (상대 경로, 기본: ".")' },
        depth: { type: 'number', description: '탐색 깊이 (기본: 3)' },
      },
      required: [],
    },
  },
  {
    name: 'read_file',
    description: '파일 내용을 읽습니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '읽을 파일 경로 (상대 경로)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: '파일을 생성하거나 덮어씁니다. 중간 디렉토리는 자동 생성됩니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (상대 경로)' },
        content: { type: 'string', description: '파일 내용' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: '파일의 특정 부분을 찾아서 교체합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '파일 경로 (상대 경로)' },
        old_text: { type: 'string', description: '찾을 텍스트' },
        new_text: { type: 'string', description: '교체할 텍스트' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'delete_file',
    description: '파일 또는 빈 디렉토리를 삭제합니다.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '삭제할 경로 (상대 경로)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: '파일 내용에서 텍스트를 검색합니다. grep과 유사합니다.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '검색할 텍스트 또는 정규식' },
        path: { type: 'string', description: '검색 시작 경로 (기본: ".")' },
        glob: { type: 'string', description: '파일 패턴 필터 (예: "*.ts")' },
      },
      required: ['pattern'],
    },
  },
]

/**
 * Resolve and validate path within the base directory (prevent escape)
 */
function safePath(baseDir: string, relPath: string): string {
  const resolved = path.resolve(baseDir, relPath)
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error(`경로가 프로젝트 폴더를 벗어납니다: ${relPath}`)
  }
  return resolved
}

function listTree(dir: string, baseDir: string, depth: number, currentDepth = 0): string[] {
  if (currentDepth >= depth) return ['  ...']
  const lines: string[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !IGNORE_DIRS.has(e.name) && !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })

    for (const entry of entries) {
      const rel = path.relative(baseDir, path.join(dir, entry.name))
      const indent = '  '.repeat(currentDepth)
      if (entry.isDirectory()) {
        lines.push(`${indent}📁 ${rel}/`)
        lines.push(...listTree(path.join(dir, entry.name), baseDir, depth, currentDepth + 1))
      } else {
        const stat = fs.statSync(path.join(dir, entry.name))
        const size = stat.size < 1024 ? `${stat.size}B` : `${(stat.size / 1024).toFixed(1)}KB`
        lines.push(`${indent}📄 ${rel} (${size})`)
      }
    }
  } catch { /* permission error etc */ }
  return lines
}

function searchInFiles(baseDir: string, pattern: string, searchPath: string, glob?: string): string {
  const results: string[] = []
  const regex = new RegExp(pattern, 'gi')
  const startDir = safePath(baseDir, searchPath)

  function walk(dir: string) {
    if (results.length > 50) return
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else {
          if (glob && !entry.name.match(new RegExp(glob.replace(/\*/g, '.*').replace(/\?/g, '.')))) continue
          try {
            const stat = fs.statSync(full)
            if (stat.size > MAX_FILE_SIZE) continue
            const content = fs.readFileSync(full, 'utf-8')
            const lines = content.split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                const rel = path.relative(baseDir, full)
                results.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
                if (results.length > 50) return
              }
            }
          } catch { /* skip binary or unreadable */ }
        }
      }
    } catch { /* permission */ }
  }

  walk(startDir)
  return results.length > 0 ? results.join('\n') : '검색 결과 없음'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait for a file to appear (created by another parallel agent).
 * Checks every 15 seconds indefinitely until the file exists.
 */
async function waitForFile(fullPath: string): Promise<void> {
  while (!fs.existsSync(fullPath)) {
    await sleep(15000)
  }
}

/**
 * Execute a file tool and return the result.
 * read_file and edit_file will wait for the file if it doesn't exist yet
 * (another parallel agent may be creating it).
 */
export async function executeFileTool(baseDir: string, toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'list_files': {
        const relPath = (input.path as string) || '.'
        const depth = (input.depth as number) || 3
        const fullPath = safePath(baseDir, relPath)
        const tree = listTree(fullPath, baseDir, depth)
        return { content: tree.length > 0 ? tree.join('\n') : '(빈 폴더)' }
      }

      case 'read_file': {
        const fullPath = safePath(baseDir, input.path as string)
        if (!fs.existsSync(fullPath)) {
          console.log(`[file-tools] read_file: 파일 대기 중... ${input.path}`)
          await waitForFile(fullPath)
          console.log(`[file-tools] read_file: 파일 발견! ${input.path}`)
        }
        const stat = fs.statSync(fullPath)
        if (stat.size > MAX_FILE_SIZE) return { content: `파일이 너무 큽니다 (${(stat.size / 1024).toFixed(1)}KB > 100KB)`, isError: true }
        return { content: fs.readFileSync(fullPath, 'utf-8') }
      }

      case 'write_file': {
        const fullPath = safePath(baseDir, input.path as string)
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, input.content as string, 'utf-8')
        return { content: `파일 작성 완료: ${input.path}` }
      }

      case 'edit_file': {
        const fullPath = safePath(baseDir, input.path as string)
        if (!fs.existsSync(fullPath)) {
          console.log(`[file-tools] edit_file: 파일 대기 중... ${input.path}`)
          await waitForFile(fullPath)
        }
        const content = fs.readFileSync(fullPath, 'utf-8')
        const oldText = input.old_text as string
        if (!content.includes(oldText)) return { content: `텍스트를 찾을 수 없습니다: "${oldText.slice(0, 50)}..."`, isError: true }
        fs.writeFileSync(fullPath, content.replace(oldText, input.new_text as string), 'utf-8')
        return { content: `파일 수정 완료: ${input.path}` }
      }

      case 'delete_file': {
        const fullPath = safePath(baseDir, input.path as string)
        if (!fs.existsSync(fullPath)) return { content: `경로가 존재하지 않습니다: ${input.path}`, isError: true }
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) fs.rmdirSync(fullPath)
        else fs.unlinkSync(fullPath)
        return { content: `삭제 완료: ${input.path}` }
      }

      case 'search_files': {
        const result = searchInFiles(baseDir, input.pattern as string, (input.path as string) || '.', input.glob as string | undefined)
        return { content: result }
      }

      default:
        return { content: `알 수 없는 도구: ${toolName}`, isError: true }
    }
  } catch (e) {
    return { content: `오류: ${(e as Error).message}`, isError: true }
  }
}

/**
 * Get a summary of the folder structure for initial context
 */
export function getFolderContext(baseDir: string): string {
  if (!fs.existsSync(baseDir)) return `폴더가 존재하지 않습니다: ${baseDir}`
  const tree = listTree(baseDir, baseDir, 3)
  return `프로젝트 폴더: ${baseDir}\n\n${tree.join('\n')}`
}
