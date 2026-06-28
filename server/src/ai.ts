// AI image-recognition module for the question-bank admin.
// Supports two protocols:
//   - 'openai':    any OpenAI-compatible endpoint (OpenAI, 智谱, 通义, DeepSeek, …)
//   - 'anthropic': Anthropic Messages API (Claude)
//
// Config is persisted in data/ai-config.json and loaded on demand so that
// changes from the admin UI take effect immediately without a server restart.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import type { QuestionRow } from '@fkzz/shared';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the config file path (same probing strategy as questions.json).
const AI_CONFIG_CANDIDATES = [
  path.resolve(__dirname, '../../data/ai-config.json'),
  path.resolve(__dirname, '../../../data/ai-config.json'),
  path.resolve(process.cwd(), 'data/ai-config.json'),
];

export type AIProvider = 'openai' | 'anthropic';

export interface AIConfig {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_CONFIG: AIConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
};

let resolvedConfigPath: string = AI_CONFIG_CANDIDATES[0]!;

export function loadAIConfig(): AIConfig {
  for (const p of AI_CONFIG_CANDIDATES) {
    try {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        resolvedConfigPath = p;
        return { ...DEFAULT_CONFIG, ...raw };
      }
    } catch {
      // ignore
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function saveAIConfig(config: AIConfig): void {
  const dir = path.dirname(resolvedConfigPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvedConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

// ----- Recognition -----

const SYSTEM_PROMPT = `你是一个题目识别助手。请仔细观察图片中的所有题目，并将它们解析为JSON格式。

支持的题型:
- single: 单选题
- multi: 多选题
- judge: 判断题（必须恰好2个选项）

返回格式（JSON数组）:
[
  {
    "kind": "single|multi|judge",
    "prompt": "题干文字",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "answerIndex": 0,
    "answerIndexes": [0, 2]
  }
]

规则:
1. answerIndex 为单选题/判断题的正确选项索引（从0开始）
2. 多选题需同时提供 answerIndexes（所有正确选项的索引数组），answerIndex 设为其中最小的
3. 判断题的 options 必须是 ["正确", "错误"]
4. 仅返回 JSON，不要附加其他文字
5. 如果图片中没有题目，返回空数组 []
6. 仔细检查选项文字，确保完整准确
7. 如果无法确定正确答案，将 answerIndex 设为 0`;

/**
 * Extract JSON from an AI response that may contain markdown fences or
 * surrounding text. Tries several strategies before giving up.
 */
function extractJSON(text: string): unknown {
  // 1. Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // 2. Extract ```json ... ``` or ``` ... ``` block
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1]!.trim()); } catch { /* continue */ }
  }

  // 3. Find the first [ ... ] array in the text (greedy to the last ])
  const bracketMatch = text.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try { return JSON.parse(bracketMatch[0]); } catch { /* continue */ }
  }

  throw new Error('无法从 AI 响应中解析出 JSON');
}

interface RawQuestion {
  kind?: string;
  prompt?: string;
  options?: string[];
  answerIndex?: number;
  answerIndexes?: number[];
}

function normalise(raw: RawQuestion, idx: number): QuestionRow {
  const kind = (raw.kind === 'multi' || raw.kind === 'judge' || raw.kind === 'single')
    ? raw.kind
    : 'single';
  const prompt = (raw.prompt ?? '').trim();
  const options = Array.isArray(raw.options) ? raw.options.map(o => String(o).trim()) : [];
  if (!prompt) throw new Error(`第 ${idx + 1} 题：题干为空`);
  if (options.length < 2) throw new Error(`第 ${idx + 1} 题：至少需要 2 个选项`);
  if (kind === 'judge' && options.length !== 2) {
    throw new Error(`第 ${idx + 1} 题：判断题必须恰好 2 个选项`);
  }

  let answerIndex = typeof raw.answerIndex === 'number' ? raw.answerIndex : 0;
  if (answerIndex < 0 || answerIndex >= options.length) answerIndex = 0;

  const row: QuestionRow = {
    id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${idx}`,
    prompt,
    options,
    answerIndex,
    kind,
  };

  if (kind === 'multi') {
    const indexes = Array.isArray(raw.answerIndexes)
      ? raw.answerIndexes.filter(i => typeof i === 'number' && i >= 0 && i < options.length)
      : [answerIndex];
    if (indexes.length === 0) indexes.push(0);
    const unique = Array.from(new Set(indexes)).sort((a, b) => a - b);
    row.answerIndexes = unique;
    row.answerIndex = unique[0]!;
  }

  return row;
}

/** Call the AI API and return parsed QuestionRow[]. */
export async function recognizeQuestions(
  base64Image: string,
  mimeType: string,
  config: AIConfig,
): Promise<QuestionRow[]> {
  if (!config.apiKey) throw new Error('请先配置 API Key');
  if (!config.baseUrl) throw new Error('请先配置 Base URL');
  if (!config.model) throw new Error('请先配置模型名称');

  let responseText: string;

  if (config.provider === 'anthropic') {
    responseText = await callAnthropic(base64Image, mimeType, config);
  } else {
    responseText = await callOpenAI(base64Image, mimeType, config);
  }

  const parsed = extractJSON(responseText);
  if (!Array.isArray(parsed)) throw new Error('AI 返回的不是数组格式');
  return parsed.map((r, i) => normalise(r as RawQuestion, i));
}

async function callOpenAI(
  base64Image: string,
  mimeType: string,
  config: AIConfig,
): Promise<string> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    model: config.model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
          { type: 'text', text: '请识别并解析这张图片中的所有题目。' },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI API 错误 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI 返回了空响应');
  return typeof content === 'string' ? content : JSON.stringify(content);
}

async function callAnthropic(
  base64Image: string,
  mimeType: string,
  config: AIConfig,
): Promise<string> {
  const url = config.baseUrl.replace(/\/+$/, '') + '/messages';
  const body = {
    model: config.model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: base64Image,
            },
          },
          { type: 'text', text: '请识别并解析这张图片中的所有题目。' },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI API 错误 (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const content = data?.content;
  if (!Array.isArray(content)) throw new Error('AI 返回了空响应');
  const textBlock = content.find((b: any) => b.type === 'text');
  if (!textBlock?.text) throw new Error('AI 返回了空响应');
  return textBlock.text;
}
