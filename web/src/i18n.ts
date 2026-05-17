// Tiny i18n module for the web client.
// Default locale is Chinese ('zh'); user can toggle to English ('en').
// The chosen locale is persisted via localStorage and exposed through the
// existing zustand store (see state/store.ts).
//
// Usage:
//   import { useT } from '../i18n';
//   const t = useT();
//   t('lobby.create')

import { useStore } from './state/store';

export type Locale = 'zh' | 'en';

export const LOCALE_STORAGE_KEY = 'fkzz.locale';

export function getInitialLocale(): Locale {
  const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
  if (v === 'en' || v === 'zh') return v;
  return 'zh';
}

type Dict = Record<string, string>;

const ZH: Dict = {
  // Common
  'common.leave':           '离开',
  'common.exit':            '退出',
  'common.send':            '发送',
  'common.or':              '或',
  'common.none':            '无',
  'common.you':             '（你）',
  'common.turn':            '回合',
  'common.empty':           '— 空位 —',
  'common.confirmLeave':    '确定离开本局？',
  'common.lang':            'EN / 中',

  // Color labels (used in HUD, GameOver)
  'color.red':              '红方',
  'color.yellow':           '黄方',
  'color.blue':             '蓝方',
  'color.green':            '绿方',
  'color.short.red':        '红',
  'color.short.yellow':     '黄',
  'color.short.blue':       '蓝',
  'color.short.green':      '绿',

  // Lobby
  'lobby.title':            '防空作战飞行棋',
  'lobby.subtitle':         '在线对战',
  'lobby.playerInfo':       '玩家信息',
  'lobby.avatar':           '头像',
  'lobby.nickname':         '昵称',
  'lobby.pilotPlaceholder': '飞行员',
  'lobby.create':           '创建房间',
  'lobby.createDesc':       '建立新房间，邀请好友加入',
  'lobby.roomCode':         '房间号',
  'lobby.codePlaceholder':  '123456',
  'lobby.join':             '加入房间',
  'lobby.joinDesc':         '输入房间号，加入已有对局',

  // Room
  'room.title':             '房间',
  'room.options':           '游戏设置',
  'room.hostOnly':          '（仅房主）',
  'room.takeoffDifficulty': '起飞难度',
  'room.diff.easy':         '简单（2 / 4 / 6 起飞）',
  'room.diff.medium':       '中等（5 / 6 起飞）',
  'room.diff.hard':         '困难（仅 6 起飞）',
  'room.turnTimeout':       '回合超时',
  'room.timeoutValue':      '{s} 秒',
  'room.victory':           '胜利条件',
  'room.victory.oneHome':   '率先 1 架飞机回家',
  'room.victory.twoHome':   '率先 2 架飞机回家',
  'room.victory.allHome':   '率先全部 4 架飞机回家',
  'room.victory.timed':     '限时赛 — 时间到时回家最多者胜',
  'room.ready':             '准备',
  'room.unready':           '取消准备',
  'room.start':             '开始游戏',

  // Game
  'game.loading':           '加载游戏中…',
  'game.spectating':        '观战中',
  'game.turnLabel':         '{color} 的回合',
  'game.phase':             '阶段：{phase}',
  'game.roll':              '掷骰子',
  'game.rolling':           '掷骰中…',
  'game.choosePlane':       '选择一架飞机移动（{n} 步）：',
  'game.takeoff':           '起飞：',
  'game.suggest':           ' — 推荐：#{idx}（{reason}）',
  'game.arsenal':           '我的装备',
  'game.radars':            '📡 雷达：',
  'game.missile.actions':   '导弹操作',
  'game.fireARM':           '对…发射 ARM',
  'game.cruise':            '巡航导弹打击…',
  'game.noTargets':         '（无可用目标）',
  'game.rewardCards':       '我的奖励卡',
  'game.makeSkip':          '让…跳过一回合',
  'game.takeoffOnly':       '位于起飞格',
  'game.inLanding':         '位于降落道',

  // Suggestion reasons (ActionPanel.recommendPlaneIdx)
  'reason.onlyTakeoff':     '唯一可起飞的候选',
  'reason.onlyMovable':     '唯一可移动的飞机',
  'reason.takeoffLowest':   '让一架新飞机起飞（编号最小）',
  'reason.reachesHome':     '可以回家 🏠',
  'reason.shortcut':        '进入同色高速通道 🛣',
  'reason.missileFactory':  '落到导弹工厂 🛩',
  'reason.radarFactory':    '落到雷达工厂 📡',
  'reason.library':         '落到图书馆 📚（答题）',
  'reason.closestProgress': '最接近终点（进度 {p}/73）',

  // HUD
  'hud.players':            '玩家',
  'hud.turn':               '行动',
  'hud.titleRadars':        '雷达',
  'hud.titleMissiles':      '导弹总数',
  'hud.titlePlanesHome':    '已回家飞机',
  'hud.skip':               '跳过',
  'hud.shield':             '护盾',
  'hud.decks':              '牌堆 — 导弹：{aam} · 雷达：{radar} · 奖励：{reward} · 惩罚：{punish} · 答题：{qa}',

  // Log / chat
  'log.title':              '日志',
  'log.placeholder':        '说点什么…',

  // Combat / QA
  'combat.title':           '战斗',
  'qa.title':               '答题挑战',
  'qa.submit':              '提交答案',

  // Game Over
  'go.victory':             '胜利！',
  'go.victorySub':          '所有飞机已回家 — 干得漂亮，{color}。',
  'go.defeated':            '失败',
  'go.winners':             '胜者：{names}',
  'go.winnersMulti':        '胜者：{names}',
  'go.gameOverWinners':     '游戏结束。胜者：{names}',
  'go.noWinner':            '无人获胜',
  'go.playAgain':           '再玩一局',
  'go.exitRoom':            '退出房间',

  // Missile types (kept bilingual labels in code)
  'missile.aam':            'AAM（空空）',
  'missile.sam':            'SAM（地空）',
  'missile.arm':            'ARM（反辐射）',
  'missile.cruise':         '巡航导弹',
};

const EN: Dict = {
  // Common
  'common.leave':           'Leave',
  'common.exit':            'Exit',
  'common.send':            'Send',
  'common.or':              'or',
  'common.none':            'none',
  'common.you':             '(you)',
  'common.turn':            'turn',
  'common.empty':           '— empty —',
  'common.confirmLeave':    'Leave the game?',
  'common.lang':            'EN / 中',

  // Color labels
  'color.red':              'Red',
  'color.yellow':           'Yellow',
  'color.blue':             'Blue',
  'color.green':            'Green',
  'color.short.red':        'R',
  'color.short.yellow':     'Y',
  'color.short.blue':       'B',
  'color.short.green':      'G',

  // Lobby
  'lobby.title':            'Air Defense Flying Chess',
  'lobby.subtitle':         'Online',
  'lobby.playerInfo':       'Player Info',
  'lobby.avatar':           'Avatar',
  'lobby.nickname':         'Nickname',
  'lobby.pilotPlaceholder': 'Pilot',
  'lobby.create':           'Create Room',
  'lobby.createDesc':       'Open a new room and invite friends to join',
  'lobby.roomCode':         'Room Code',
  'lobby.codePlaceholder':  '123456',
  'lobby.join':             'Join Room',
  'lobby.joinDesc':         'Enter a room code to join an existing game',

  // Room
  'room.title':             'Room',
  'room.options':           'Game Options',
  'room.hostOnly':          '(host only)',
  'room.takeoffDifficulty': 'Takeoff Difficulty',
  'room.diff.easy':         'Easy (takeoff on 2 / 4 / 6)',
  'room.diff.medium':       'Medium (takeoff on 5 / 6)',
  'room.diff.hard':         'Hard (takeoff on 6 only)',
  'room.turnTimeout':       'Turn timeout',
  'room.timeoutValue':      '{s}s',
  'room.victory':           'Victory condition',
  'room.victory.oneHome':   'First to land 1 plane home',
  'room.victory.twoHome':   'First to land 2 planes home',
  'room.victory.allHome':   'First to land ALL 4 planes home',
  'room.victory.timed':     'Timed — most planes home when time is up',
  'room.ready':             'Ready',
  'room.unready':           'Unready',
  'room.start':             'Start Game',

  // Game
  'game.loading':           'Loading game…',
  'game.spectating':        'Spectating',
  'game.turnLabel':         "{color}'s turn",
  'game.phase':             'phase: {phase}',
  'game.roll':              'Roll Dice',
  'game.rolling':           'Rolling…',
  'game.choosePlane':       'Choose a plane to move ({n} steps):',
  'game.takeoff':           'Take off:',
  'game.suggest':           ' — suggested: #{idx} ({reason})',
  'game.arsenal':           'My arsenal',
  'game.radars':            '📡 Radars:',
  'game.missile.actions':   'Missile actions',
  'game.fireARM':           'Fire ARM at…',
  'game.cruise':            'Cruise at…',
  'game.noTargets':         '(no valid targets)',
  'game.rewardCards':       'My reward cards',
  'game.makeSkip':          'Make … skip',
  'game.takeoffOnly':       'on takeoff',
  'game.inLanding':         'in landing',

  // Suggestion reasons
  'reason.onlyTakeoff':     'only candidate to take off',
  'reason.onlyMovable':     'only movable plane',
  'reason.takeoffLowest':   'take off a new plane (lowest index)',
  'reason.reachesHome':     'reaches home 🏠',
  'reason.shortcut':        'enters highway shortcut 🛣',
  'reason.missileFactory':  'lands on missile factory 🛩',
  'reason.radarFactory':    'lands on radar factory 📡',
  'reason.library':         'lands on library 📚 (Q&A)',
  'reason.closestProgress': 'closest to home (progress {p}/73)',

  // HUD
  'hud.players':            'Players',
  'hud.turn':               'turn',
  'hud.titleRadars':        'Radars',
  'hud.titleMissiles':      'Missiles total',
  'hud.titlePlanesHome':    'Planes home',
  'hud.skip':               'skip',
  'hud.shield':             'shield',
  'hud.decks':              'Decks — missiles: {aam} · radar: {radar} · reward: {reward} · punish: {punish} · QA: {qa}',

  // Log / chat
  'log.title':              'Log',
  'log.placeholder':        'Say something…',

  // Combat / QA
  'combat.title':           'Combat',
  'qa.title':               'Q&A Challenge',
  'qa.submit':              'Submit Answer',

  // Game Over
  'go.victory':             'Victory!',
  'go.victorySub':          'All your planes are home — well played, {color}.',
  'go.defeated':            'Defeated',
  'go.winners':             'Winner: {names}',
  'go.winnersMulti':        'Winners: {names}',
  'go.gameOverWinners':     'Game over. Winner(s): {names}',
  'go.noWinner':            'No winner',
  'go.playAgain':           'Play Again',
  'go.exitRoom':            'Exit Room',

  // Missile types
  'missile.aam':            'AAM (Air-Air)',
  'missile.sam':            'SAM (Surf-Air)',
  'missile.arm':            'ARM (Anti-Radar)',
  'missile.cruise':         'Cruise',
};

const DICTS: Record<Locale, Dict> = { zh: ZH, en: EN };

/** Substitute `{key}` placeholders with values from `params`. */
function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => {
    const v = params[k];
    return v === undefined ? `{${k}}` : String(v);
  });
}

/** Resolve a key in a given locale, falling back to English then to the key itself. */
export function translate(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const tpl = DICTS[locale][key] ?? DICTS.en[key] ?? key;
  return format(tpl, params);
}

/** React hook returning a translator bound to the current locale. */
export function useT() {
  const locale = useStore(s => s.locale);
  return (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
}

/** React hook returning [locale, setLocale]. */
export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useStore(s => s.locale);
  const setLocale = useStore(s => s.setLocale);
  return [locale, setLocale];
}
