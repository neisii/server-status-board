import React, { useState, useEffect, useRef } from 'react';
import { render, Box, Text } from 'ink';
import { execFile } from 'node:child_process';
import stringWidth from 'string-width';
import { STATUS_COLORS, resolveTheme } from './theme.js';

const h = React.createElement;

// config.local.js는 .gitignore 대상이라 저장소에는 없다(config.example.js 참고). 없으면 example로 돌아간다.
let configModule;
try {
  configModule = await import('./config.local.js');
} catch {
  configModule = await import('./config.example.js');
  console.error('[server-status-board] config.local.js가 없어 config.example.js 값으로 실행합니다. config.example.js를 config.local.js로 복사해 실제 값으로 채우세요.');
}
const { STATUS_SCRIPT, PROJECT_ORDER, SHOW_BRANCH_INFO = false, THEME } = configModule;
const POLL_MS = 10000;
const theme = resolveTheme(THEME);

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowHms() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fetchStatus() {
  return new Promise((resolve, reject) => {
    // -File로 직접 실행하면 콘솔이 아닌 리다이렉트 stdout은 한글이 CP949로 깨져 나온다.
    // [Console]::OutputEncoding을 UTF8로 바꾼 뒤 호출해야 Node 쪽 utf8 디코딩과 맞는다(실측 확인).
    const command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${STATUS_SCRIPT}' -Json`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (parseErr) {
          reject(parseErr);
        }
      },
    );
  });
}

// 콜백을 ref에 담아 interval 자체는 delayMs가 바뀔 때만 다시 건다(digital-clock-board와 동일 패턴).
function useInterval(callback, delayMs) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    const id = setInterval(() => callbackRef.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

function portCell(row) {
  if (row.Location === '중지됨') {
    return { text: '-', color: STATUS_COLORS.stopped };
  }
  if (row.Health !== `HTTP 200` && String(row.Health).startsWith('HTTP')) {
    return { text: row.Health, color: STATUS_COLORS.error };
  }
  if (row.Health === '응답없음' || row.Health === '-') {
    return { text: '응답없음', color: STATUS_COLORS.error };
  }
  const warn = Boolean(row.PortWarning);
  return { text: `${row.Port}${warn ? '*' : ''}`, color: warn ? STATUS_COLORS.warn : STATUS_COLORS.ok };
}

function branchCell(row) {
  if (row.Location === '중지됨' || !row.Branch) {
    return '-';
  }
  const uncommitted = Number(row.Uncommitted) || 0;
  return `[B]${row.Branch}${uncommitted > 0 ? ` M${uncommitted}` : ''}`;
}

// Row가 그리는 세 칸을 그대로 이어붙인 평문. 폭 계산(rowPlainText 호출부)과 항상 같은 값을 써야 해서 분리했다.
function rowPlainText(name, col1, col2) {
  return name.padEnd(12) + String(col1).padEnd(col2 == null ? 0 : 12) + (col2 == null ? '' : col2);
}

function Row({ name, col1, col1Color, col2 }) {
  return h(
    Box,
    null,
    h(Text, { color: STATUS_COLORS.text }, name.padEnd(12)),
    h(Text, { color: col1Color || STATUS_COLORS.text }, String(col1).padEnd(col2 == null ? 0 : 12)),
    col2 == null ? null : h(Text, { color: STATUS_COLORS.text }, col2),
  );
}

function Board() {
  const [rowsByProject, setRowsByProject] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [lastError, setLastError] = useState(null);

  async function poll() {
    try {
      const rows = await fetchStatus();
      const map = {};
      for (const row of rows) map[row.Project] = row;
      setRowsByProject(map);
      setLastUpdated(nowHms());
      setLastError(null);
    } catch (err) {
      setLastError(nowHms());
    }
  }

  useEffect(() => {
    poll();
  }, []);
  useInterval(poll, POLL_MS);

  let titleSuffix;
  let titleColor = STATUS_COLORS.suffix;
  if (!lastUpdated) {
    titleSuffix = '(불러오는 중...)';
  } else if (lastError) {
    titleSuffix = `(${lastError} 갱신 실패, ${lastUpdated} 값 표시)`;
    titleColor = STATUS_COLORS.error;
  } else {
    titleSuffix = `(${lastUpdated} 갱신)`;
  }

  const legendText = SHOW_BRANCH_INFO
    ? '[B] = 브랜치명, * = 포트가 WT-10 기본값과 다름(참고용), M숫자 = 미커밋 변경 수'
    : '* = 포트가 WT-10 기본값과 다름(참고용)';

  const rowSpecs = PROJECT_ORDER.map((name) => {
    const row = rowsByProject && rowsByProject[name];
    if (!row) {
      return { key: name, name, col1: '...', col1Color: 'gray', col2: SHOW_BRANCH_INFO ? '...' : null };
    }
    const port = portCell(row);
    return {
      key: name,
      name,
      col1: port.text,
      col1Color: port.color,
      col2: SHOW_BRANCH_INFO ? branchCell(row) : null,
    };
  });

  // Ink은 루트 Box의 width를 매 렌더마다 터미널 전체 너비로 강제한다(ink.js의 calculateLayout).
  // 그래서 "가장 긴 줄만큼만" 쓰려면 width를 직접 계산해 넘겨야 한다 — 지정 안 해도 저절로 줄어들지 않는다.
  const titleText = `서버 상태  ${titleSuffix}`;
  const contentWidth = Math.max(
    stringWidth(titleText),
    stringWidth(legendText),
    ...rowSpecs.map((spec) => stringWidth(rowPlainText(spec.name, spec.col1, spec.col2))),
  );
  // 제목 줄(특히 갱신 실패 문구처럼 평소보다 긴 titleSuffix)이 터미널 실제 칸 수보다 넓은
  // boardWidth를 요구하면, Ink가 터미널보다 넓은 테두리를 그릴 수 없어 그 줄이 줄바꿈되면서
  // 테두리가 깨진다(claude-agents-board에서 실측 확인: 갱신 실패 문구 + 단축키 안내가 겹친
  // 순간 테두리가 틀어졌다가 갱신 성공 후 문구가 짧아지면서 저절로 풀림). 그래서 터미널 칸
  // 수를 넘지 않도록 최종 폭을 한 번 더 clamp한다.
  const rawBoardWidth = contentWidth + 2 /* paddingX 양쪽 */ + 2 /* borderStyle 양쪽 */;
  const terminalColumns = process.stdout.columns || rawBoardWidth;
  const boardWidth = Math.max(4, Math.min(rawBoardWidth, terminalColumns));

  // claude-agents-board와 같은 패턴: 내용이 짧아도 처음부터 터미널 높이만큼 테두리를 늘려 두고
  // (좌우 테두리가 패널 바닥까지 이어진다), 범례는 justifyContent: space-between으로 "위 블록"과
  // 양 끝에 고정해서 내용 길이와 무관하게 항상 하단 테두리 바로 위 줄에 오게 한다(남는 자리는
  // 둘 사이의 빈 칸으로 몰린다).
  const terminalRows = process.stdout.rows || 24;

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: theme.border,
      paddingX: 1,
      width: boardWidth,
      height: terminalRows,
      justifyContent: 'space-between',
    },
    h(
      Box,
      { flexDirection: 'column' },
      h(
        Box,
        null,
        h(Text, { color: theme.title }, '서버 상태  '),
        h(Text, { color: titleColor }, titleSuffix),
      ),
      h(Box, { height: 1 }),
      ...rowSpecs.map((spec) => h(Row, spec)),
    ),
    h(Text, { color: STATUS_COLORS.stopped }, legendText),
  );
}

render(h(Board));
