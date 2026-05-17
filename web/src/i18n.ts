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
  'common.on':              '开',
  'common.off':             '关',
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
  'lobby.private':          '设为私密房间',
  'lobby.privateHint':      '私密房间不会出现在大厅列表中，仅可通过房间号加入',
  'lobby.roomCode':         '房间号',
  'lobby.codePlaceholder':  '123456',
  'lobby.join':             '加入房间',
  'lobby.joinDesc':         '输入房间号，加入已有对局',
  'lobby.publicRooms':      '公开房间',
  'lobby.publicRoomsEmpty': '当前还没有公开房间，去创建一个吧',
  'lobby.publicJoinBtn':    '加入',
  'lobby.refresh':          '刷新',
  'lobby.host':             '房主',
  'lobby.seats':            '人数',
  'lobby.adminLink':        '题库录入',

  // Question-bank admin page
  'admin.title':              '题库录入',
  'admin.back':               '返回大厅',
  'admin.save':               '保存',
  'admin.saving':             '保存中…',
  'admin.saved':              '已保存（共 {n} 题）',
  'admin.loading':            '加载中…',
  'admin.empty':              '题库为空，点击上方按钮添加题目',
  'admin.add':                '新增',
  'admin.filter':             '筛选',
  'admin.filter.all':         '全部',
  'admin.kind.single':        '单选题',
  'admin.kind.multi':         '多选题',
  'admin.kind.judge':         '判断题',
  'admin.judge.true':         '正确',
  'admin.judge.false':        '错误',
  'admin.prompt':             '题干',
  'admin.promptPlaceholder':  '请输入题目内容…',
  'admin.options':            '选项（选中即为正确答案）',
  'admin.addOption':          '添加选项',
  'admin.removeOption':       '删除该选项',
  'admin.optionPlaceholder':  '选项内容',
  'admin.markCorrect':        '标记为正确答案',
  'admin.delete':             '删除',
  'admin.moveUp':             '上移',
  'admin.moveDown':           '下移',
  'admin.confirmDelete':      '确定删除该题？',
  'admin.multiHint':          '已选正确答案：{ans}',
  'admin.err.noPrompt':       '题干不能为空',
  'admin.err.minOptions':     '至少需要 2 个选项',
  'admin.err.emptyOption':    '选项内容不能为空',
  'admin.err.judgeTwo':       '判断题必须恰好 2 个选项',
  'admin.err.multiAtLeastOne':'多选题至少需要 1 个正确答案',
  'admin.err.answerOutOfRange':'正确答案下标越界',
  'admin.err.loadFailed':     '加载失败',
  'admin.err.saveFailed':     '保存失败',

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
  'room.collisionAllEnemies':     '撞机时全部敌机回库',
  'room.collisionAllEnemiesHint': '默认关闭（说明书规则）：若撞上对方机叠，仅其中一架回库；开启后，整叠敌机一起回库',
  'room.addBot':            '加入电脑',
  'room.removeBot':         '移除',
  'player.bot':             '电脑',
  'game.autopilot':         '自动挂机',
  'game.autopilotHint':     '勾选后由服务器自动代为投骰、移动与作战决策',
  'room.ready':             '准备',
  'room.unready':           '取消准备',
  'room.start':             '开始游戏',
  'room.loading':           '加载中…',
  'room.offline':           '（离线）',
  'room.hostLeft':          '房主已离开，等待回来…',
  'room.hostLeftCountdown': '若 {s} 秒内房主未回到房间，房间将被解散。',
  'room.disbanded':         '房主在限定时间内未回来，房间已解散。',

  // Room-info side panel (in-game)
  'roomInfo.title':         '房间信息',

  // Game
  'game.loading':           '加载游戏中…',
  'game.spectating':        '观战中',
  'game.turnLabel':         '{color} 的回合',
  'game.phase':             '阶段：{phase}',
  'phase.lobby':              '等待中',
  'phase.awaitRoll':          '等待掷骰',
  'phase.awaitTakeoffChoice': '选择起飞飞机',
  'phase.awaitMoveChoice':    '选择移动飞机',
  'phase.resolving':          '结算中',
  'phase.awaitCardActions':   '等待出牌',
  'phase.awaitCombat':        '空战中',
  'phase.awaitQA':            '答题中',
  'phase.gameOver':           '游戏结束',
  'game.roll':              '掷骰子',
  'game.rolling':           '掷骰中…',
  'game.choosePlane':       '选择一架飞机移动（{n} 步）：',
  'game.takeoff':           '起飞：',
  'game.suggest':           ' — 推荐：#{idx}（{reason}）',
  'game.suggestBtn':        '提示',
  'game.autoSuggest':       '自动提示',
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
  'reason.takeoffToCell':   '滑行至起飞点 🚀（停机坪 → 起飞点）',
  'reason.reachesHome':     '可以回家 🏠',
  'reason.shortcut':        '进入同色高速通道 🛣',
  'reason.missileFactory':  '落到导弹工厂 🚀',
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
  // Structured server log lines (rendered via i18n: prefix)
  'log.skippedRound':       '{color} 跳过一回合',
  'log.rolled':             '{color} 掷出了 {n}',
  'log.tripleSix':          '{color} 连掷三个 6 — 本回合作废',
  'log.noLegalMove':        '{color} 没有可行动作',
  'log.tookOff':            '{color} 的 #{n} 号机起飞',
  'log.bounced':            '{color} 越过基地，反弹回退',
  'log.shortcut':           '{color} 触发了捷径跳跃',
  'log.jumped':             '{color} 在同色格子跳跃',
  'log.reachedHome':        '{color} 的 #{n} 号机抵达基地',
  'log.perched':            '{color} 叠停在 {enemy} 的机叠之上',
  'log.stackBounce':        '{color} 行进至 {enemy} 机叠后倒退 {n} 步',
  'log.collision':          '碰撞：{color} #{n} 撞上 {list} — 全部回库',
  'log.aamDuel':            '空空导弹对决：进攻方 {attacker} vs 防守方 {defender}',
  'log.aamRoll':            '{color} 在空战中掷出 {n}',
  'log.returnHangar':       '{color} #{n} 返回机库',
  'log.counterAam':         '反击空空：防守方 {defender} vs 进攻方 {attacker}',
  'log.counterAttackerWins':'反击中进攻方再次取胜 — 双方留场，进攻方继续',
  'log.counterTie':         '反击平局 — 双方留场',
  'log.aamTie':             '空空对决平局 — 双方留场',
  'log.samShielded':        '{color} 用护盾抵挡了地空导弹',
  'log.samHit':             '地空命中：{color} #{n} 返回机库',
  'log.heldFire':           '{color} 选择按兵不动',
  'log.drewMissile':        '{color} 获得一枚导弹',
  'log.gotRadar':           '{color} 获得雷达（共 {n}）',
  'log.libraryEmpty':       '题库未加载题目 — 无效果',
  'log.qaCorrect':          '{color} 答题正确 — 抽奖励卡',
  'log.qaWrong':            '{color} 答题错误 — 抽惩罚卡',
  'log.drewReward':         '{color} 抽到奖励：{kind}',
  'log.willReroll':         '{color} 将额外掷骰前进',
  'log.drewPunishment':     '{color} 抽到惩罚：{kind}',
  'log.retreats':           '{color} 后退 {n} 步',
  'log.willSkip':           '{color} 将跳过一回合',
  'log.enemySkip':          '{color} 强制 {target} 跳过一回合',
  'log.armFire':            '{attacker} 对 {defender} 雷达发射 ARM — 掷出 {n}',
  'log.armSuccess':         'ARM 命中 — {color} 损失一座雷达（剩 {n}）',
  'log.armMiss':            'ARM 未命中',
  'log.cruiseShielded':     '{color} 用护盾抵挡了巡航导弹',
  'log.cruiseTakeoffHit':   '巡航命中起飞位 — {color} #{n} 返回机库',
  'log.cruiseLandingRoll':  '巡航攻击降落带 — 掷出 {n}',
  'log.cruiseHit':          '巡航命中 — {color} #{n} 返回机库',
  'log.cruiseMiss':         '巡航未命中',
  'log.armShielded':        '{color} 用护盾抵挡了反辐射导弹',
  'log.aamDefenderHoldsFire':'{color} 选择不反击 — 进攻方继续移动',
  'log.drewCard':           '{color} 抽了一张牌',
  'log.gameOver':           '游戏结束 — 获胜者：{list}',
  'log.engineError':        '引擎错误：{msg}',

  // Combat / QA
  'combat.title':           '战斗',
  'combat.aamPrompt':       '与 {defender} 发生碰撞，是否发射空空导弹？',
  'combat.aamProactivePrompt':'前方 4 格内出现 {defender} 的飞机，是否发射空空导弹？',
  'combat.samPrompt':       '敌机 {attacker} 进入你的雷达区 — 是否发射地空导弹？',
  'combat.counterAamPrompt':'反击空空：与 {attacker} 对决，选择应对方式。',
  'combat.aam.attackerRoll':'空空对决 — {attacker}（进攻方）请掷骰。',
  'combat.aam.defenderRoll':'空空对决 — 进攻方掷出 {attackerRoll}，{defender}（防守方）请掷骰。',
  'combat.aam.counterDecision':'防御成功（{attackerRoll} vs {defenderRoll}）。是否消耗一发空空导弹反击 {attacker}？',
  'combat.aam.counterDefenderRoll':'反击 — {defender}（防守方）请掷骰。',
  'combat.aam.counterAttackerRoll':'反击 — 防守方掷出 {counterDefenderRoll}，{attacker}（进攻方）请掷骰。',
  'combat.armRoll':         '反辐射轰炸 — {attacker} 对 {defender} 的雷达发起攻击，请掷骰（5/6 命中）。',
  'combat.cruiseRoll':      '巡航轰炸降落带 — {attacker} 攻击 {defender}，请掷骰（4/5/6 命中）。',
  'combat.punishRetreatRoll':'惩罚卡：再掷一次骰子并按点数后退，请掷骰。',
  'combat.opt.fire':        '发射',
  'combat.opt.skip':        '不打',
  'combat.opt.roll':        '掷骰',
  'combat.opt.counter':     '反击',
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

  // Missile kinds — short labels used inside log lines (e.g. drewMissile {kind}).
  'missile.kind.aam':       '空空',
  'missile.kind.sam':       '地空',
  'missile.kind.arm':       '反辐射',
  'missile.kind.cruise':    '巡航',

  // Reward card kinds — used in hand list and log lines.
  'reward.rerollFwd':       '再掷+前进',
  'reward.fwd2':            '前进 2',
  'reward.fwd4':            '前进 4',
  'reward.fwd6':            '前进 6',
  'reward.gainMissile':     '获得导弹',
  'reward.gainRadar':       '获得雷达',
  'reward.enemySkip':       '让对手跳过',
  'reward.shield':          '护盾',

  // Punishment card kinds.
  'punishment.rerollBwd':   '再掷+后退',
  'punishment.bwd2':        '后退 2',
  'punishment.bwd4':        '后退 4',
  'punishment.bwd6':        '后退 6',
  'punishment.toTakeoff':   '回到起飞位',
  'punishment.selfSkip':    '跳过一回合',
  'punishment.loseMissile': '损失导弹',
  'punishment.loseRadar':   '损失雷达',

  // Engine error codes (returned by err() / sendErr / S2C.Error).
  'errcode.notYourRoll':            '现在不是你的掷骰回合',
  'errcode.notYourTurn':            '现在不是你的回合',
  'errcode.notYourDecision':        '该决定不属于你',
  'errcode.notYourSam':             '该地空导弹不属于你',
  'errcode.notYourQa':              '该题目不属于你',
  'errcode.cannotTakeoffNow':       '当前阶段不能起飞',
  'errcode.cannotTakeoffOnRoll':    '此点数不可起飞',
  'errcode.notHangarPlane':         '该飞机不在停机坪',
  'errcode.notInMovePhase':         '当前阶段无法移动',
  'errcode.noSuchPlane':            '没有这架飞机',
  'errcode.planeNotMovable':        '该飞机无法移动',
  'errcode.noSuchCombat':           '没有这场战斗',
  'errcode.noSam':                  '没有地空导弹',
  'errcode.noAam':                  '没有空空导弹',
  'errcode.noQa':                   '没有进行中的答题',
  'errcode.badChoice':              '无效选项',
  'errcode.unhandledCombat':        '未知战斗类型',
  'errcode.unhandledAamStep':       '未知空战阶段',
  'errcode.cannotPlayReward':       '当前不能使用该奖励卡',
  'errcode.armNeedsTarget':         '反辐射导弹需要选择敌方目标',
  'errcode.cruiseNeedsTarget':      '巡航导弹需要选择敌方飞机',
  'errcode.cannotPlayMissileDirect':'该导弹不能直接打出',
  'errcode.cardNotFound':           '未找到该卡牌',
  'errcode.targetNoRadars':         '目标没有可摧毁的雷达',
  'errcode.targetNotOnBoard':       '目标飞机不在场上',
  'errcode.cruiseTargetInvalid':    '巡航导弹只能攻击起飞位或降落带的飞机',
  // Network / room codes
  'errcode.BAD_PAYLOAD':            '请求数据无效',
  'errcode.NO_SESSION':             '会话已失效，请重新登录',
  'errcode.NO_PLAYER':              '玩家不存在',
  'errcode.NO_ROOM':                '房间不存在',
  'errcode.CANT_START':             '当前无法开始游戏',
  'errcode.CANT_RESTART':           '当前无法重开游戏',
};

const EN: Dict = {
  // Common
  'common.leave':           'Leave',
  'common.exit':            'Exit',
  'common.send':            'Send',
  'common.or':              'or',
  'common.none':            'none',
  'common.on':              'On',
  'common.off':             'Off',
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
  'lobby.private':          'Make it private',
  'lobby.privateHint':      'Private rooms are hidden from the lobby; only joinable by room code',
  'lobby.roomCode':         'Room Code',
  'lobby.codePlaceholder':  '123456',
  'lobby.join':             'Join Room',
  'lobby.joinDesc':         'Enter a room code to join an existing game',
  'lobby.publicRooms':      'Public Rooms',
  'lobby.publicRoomsEmpty': 'No public rooms yet — create one!',
  'lobby.publicJoinBtn':    'Join',
  'lobby.refresh':          'Refresh',
  'lobby.host':             'Host',
  'lobby.seats':            'Seats',
  'lobby.adminLink':        'Question Bank',

  // Question-bank admin page
  'admin.title':              'Question Bank Editor',
  'admin.back':               'Back to Lobby',
  'admin.save':               'Save',
  'admin.saving':             'Saving…',
  'admin.saved':              'Saved ({n} questions)',
  'admin.loading':            'Loading…',
  'admin.empty':              'No questions yet — click a button above to add one.',
  'admin.add':                'Add',
  'admin.filter':             'Filter',
  'admin.filter.all':         'All',
  'admin.kind.single':        'Single Choice',
  'admin.kind.multi':         'Multiple Choice',
  'admin.kind.judge':         'True / False',
  'admin.judge.true':         'True',
  'admin.judge.false':        'False',
  'admin.prompt':             'Question',
  'admin.promptPlaceholder':  'Enter the question text…',
  'admin.options':            'Options (check the correct one)',
  'admin.addOption':          'Add option',
  'admin.removeOption':       'Remove this option',
  'admin.optionPlaceholder':  'Option text',
  'admin.markCorrect':        'Mark as correct',
  'admin.delete':             'Delete',
  'admin.moveUp':             'Move Up',
  'admin.moveDown':           'Move Down',
  'admin.confirmDelete':      'Delete this question?',
  'admin.multiHint':          'Correct answers: {ans}',
  'admin.err.noPrompt':       'Question text is required',
  'admin.err.minOptions':     'At least 2 options required',
  'admin.err.emptyOption':    'Option text cannot be empty',
  'admin.err.judgeTwo':       'True/False must have exactly 2 options',
  'admin.err.multiAtLeastOne':'Multiple choice needs at least 1 correct answer',
  'admin.err.answerOutOfRange':'Answer index out of range',
  'admin.err.loadFailed':     'Load failed',
  'admin.err.saveFailed':     'Save failed',

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
  'room.collisionAllEnemies':     'Collision returns all enemies on cell',
  'room.collisionAllEnemiesHint': 'Default off (rulebook): only one of an enemy stack returns. On: the entire enemy stack returns to hangar.',
  'room.addBot':            'Add Computer',
  'room.removeBot':         'Remove',
  'player.bot':             'Computer',
  'game.autopilot':         'Autopilot',
  'game.autopilotHint':     'When on, the server auto-rolls, moves, and resolves combat for you',
  'room.ready':             'Ready',
  'room.unready':           'Unready',
  'room.start':             'Start Game',
  'room.loading':           'Loading…',
  'room.offline':           '(offline)',
  'room.hostLeft':          'Host has left. Waiting for them to come back…',
  'room.hostLeftCountdown': 'Room will be disbanded in {s}s if the host does not return.',
  'room.disbanded':         'Host did not come back in time — the room has been disbanded.',

  // Room-info side panel (in-game)
  'roomInfo.title':         'Room Info',

  // Game
  'game.loading':           'Loading game…',
  'game.spectating':        'Spectating',
  'game.turnLabel':         "{color}'s turn",
  'game.phase':             'phase: {phase}',
  'phase.lobby':              'Waiting',
  'phase.awaitRoll':          'Awaiting roll',
  'phase.awaitTakeoffChoice': 'Choose plane to take off',
  'phase.awaitMoveChoice':    'Choose plane to move',
  'phase.resolving':          'Resolving',
  'phase.awaitCardActions':   'Awaiting card play',
  'phase.awaitCombat':        'Combat',
  'phase.awaitQA':            'Q&A',
  'phase.gameOver':           'Game over',
  'game.roll':              'Roll Dice',
  'game.rolling':           'Rolling…',
  'game.choosePlane':       'Choose a plane to move ({n} steps):',
  'game.takeoff':           'Take off:',
  'game.suggest':           ' — suggested: #{idx} ({reason})',
  'game.suggestBtn':        'Hint',
  'game.autoSuggest':       'Auto hint',
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
  'reason.takeoffToCell':   'take off to takeoff cell 🚀 (hangar → takeoff)',
  'reason.reachesHome':     'reaches home 🏠',
  'reason.shortcut':        'enters highway shortcut 🛣',
  'reason.missileFactory':  'lands on missile factory 🚀',
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
  // Structured server log lines (rendered via i18n: prefix)
  'log.skippedRound':       '{color} skipped a round',
  'log.rolled':             '{color} rolled {n}',
  'log.tripleSix':          "{color} rolled three 6's — turn cancelled",
  'log.noLegalMove':        '{color} has no legal move',
  'log.tookOff':            "{color}'s plane #{n} took off",
  'log.bounced':            '{color} bounced back from home overshoot',
  'log.shortcut':           '{color} took a shortcut',
  'log.jumped':             '{color} jumped on a same-color cell',
  'log.reachedHome':        "{color}'s plane #{n} reached home",
  'log.perched':            "{color} perched on top of {enemy}'s stack",
  'log.stackBounce':        "{color} reached {enemy}'s stack and retreated {n} step(s)",
  'log.collision':          'Collision: {color}#{n} vs {list} — all return to hangar',
  'log.aamDuel':            'AAM duel: attacker {attacker} vs defender {defender}',
  'log.aamRoll':            '{color} rolled {n} in the AAM duel',
  'log.returnHangar':       '{color}#{n} returns to hangar',
  'log.counterAam':         'Counter AAM: defender {defender} vs attacker {attacker}',
  'log.counterAttackerWins':'Attacker re-wins after counter — both stay, attacker continues',
  'log.counterTie':         'Counter tie — both stay',
  'log.aamTie':             'AAM tie — both stay',
  'log.samShielded':        '{color} shielded SAM hit',
  'log.samHit':             'SAM hit: {color}#{n} returns to hangar',
  'log.heldFire':           '{color} held fire',
  'log.drewMissile':        '{color} obtained a missile',
  'log.gotRadar':           '{color} got a radar (now {n})',
  'log.libraryEmpty':       'Library has no questions loaded — no effect',
  'log.qaCorrect':          '{color} answered correctly — drawing reward',
  'log.qaWrong':            '{color} answered wrong — drawing punishment',
  'log.drewReward':         '{color} drew reward: {kind}',
  'log.willReroll':         '{color} will reroll & advance',
  'log.drewPunishment':     '{color} drew punishment: {kind}',
  'log.retreats':           '{color} retreats {n}',
  'log.willSkip':           '{color} will skip a round',
  'log.enemySkip':          '{color} forces {target} to skip a round',
  'log.armFire':            '{attacker} fires ARM at {defender} radar — rolled {n}',
  'log.armSuccess':         'ARM success — {color} loses a radar (now {n})',
  'log.armMiss':            'ARM missed',
  'log.cruiseShielded':     '{color} shielded the cruise missile',
  'log.cruiseTakeoffHit':   'Cruise auto-hits {color}#{n} on takeoff — returns to hangar',
  'log.cruiseLandingRoll':  'Cruise vs landing strip — rolled {n}',
  'log.cruiseHit':          'Cruise hit — {color}#{n} returns to hangar',
  'log.cruiseMiss':         'Cruise missed',
  'log.armShielded':        '{color} shielded the ARM strike',
  'log.aamDefenderHoldsFire':'{color} held fire — attacker continues',
  'log.drewCard':           '{color} drew a card',
  'log.gameOver':           'Game over — winners: {list}',
  'log.engineError':        'engine error: {msg}',

  // Combat / QA
  'combat.title':           'Combat',
  'combat.aamPrompt':       'Collision with {defender} — fire AAM?',
  'combat.aamProactivePrompt':'Enemy {defender} appears within 4 cells ahead — fire AAM?',
  'combat.samPrompt':       'Enemy {attacker} entered your radar zone — fire SAM?',
  'combat.counterAamPrompt':'Counter AAM: facing {attacker} — choose your response.',
  'combat.aam.attackerRoll':'AAM duel — attacker {attacker}, please roll.',
  'combat.aam.defenderRoll':'AAM duel — attacker rolled {attackerRoll}; defender {defender}, please roll.',
  'combat.aam.counterDecision':'Defense succeeded ({attackerRoll} vs {defenderRoll}). Spend an AAM to counter {attacker}?',
  'combat.aam.counterDefenderRoll':'Counter — defender {defender}, please roll.',
  'combat.aam.counterAttackerRoll':'Counter — defender rolled {counterDefenderRoll}; attacker {attacker}, please roll.',
  'combat.armRoll':         'ARM strike — {attacker} attacks {defender} radar; please roll (5/6 hits).',
  'combat.cruiseRoll':      'Cruise vs landing strip — {attacker} attacks {defender}; please roll (4/5/6 hits).',
  'combat.punishRetreatRoll':'Punishment: roll the dice and retreat that many steps.',
  'combat.opt.fire':        'Fire',
  'combat.opt.skip':        'Hold',
  'combat.opt.roll':        'Roll',
  'combat.opt.counter':     'Counter',
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

  // Missile kinds — short labels used inside log lines.
  'missile.kind.aam':       'AAM',
  'missile.kind.sam':       'SAM',
  'missile.kind.arm':       'ARM',
  'missile.kind.cruise':    'Cruise',

  // Reward card kinds.
  'reward.rerollFwd':       'Reroll & Advance',
  'reward.fwd2':            'Advance 2',
  'reward.fwd4':            'Advance 4',
  'reward.fwd6':            'Advance 6',
  'reward.gainMissile':     'Gain Missile',
  'reward.gainRadar':       'Gain Radar',
  'reward.enemySkip':       'Force Enemy Skip',
  'reward.shield':          'Shield',

  // Punishment card kinds.
  'punishment.rerollBwd':   'Reroll & Retreat',
  'punishment.bwd2':        'Retreat 2',
  'punishment.bwd4':        'Retreat 4',
  'punishment.bwd6':        'Retreat 6',
  'punishment.toTakeoff':   'Back to Takeoff',
  'punishment.selfSkip':    'Skip a Round',
  'punishment.loseMissile': 'Lose Missile',
  'punishment.loseRadar':   'Lose Radar',

  // Engine error codes (returned by err() / sendErr / S2C.Error).
  'errcode.notYourRoll':            "It's not your roll",
  'errcode.notYourTurn':            "It's not your turn",
  'errcode.notYourDecision':        'This decision is not yours to make',
  'errcode.notYourSam':             "That SAM is not yours",
  'errcode.notYourQa':              'That question is not for you',
  'errcode.cannotTakeoffNow':       'Cannot take off in the current phase',
  'errcode.cannotTakeoffOnRoll':    'Cannot take off on this roll',
  'errcode.notHangarPlane':         'That plane is not in the hangar',
  'errcode.notInMovePhase':         'Not in the move phase',
  'errcode.noSuchPlane':            'No such plane',
  'errcode.planeNotMovable':        'That plane is not movable',
  'errcode.noSuchCombat':           'No such combat',
  'errcode.noSam':                  'No SAM available',
  'errcode.noAam':                  'No AAM available',
  'errcode.noQa':                   'No active Q&A',
  'errcode.badChoice':              'Invalid choice',
  'errcode.unhandledCombat':        'Unhandled combat kind',
  'errcode.unhandledAamStep':       'Unhandled AAM step',
  'errcode.cannotPlayReward':       'Cannot play this reward now',
  'errcode.armNeedsTarget':         'ARM needs an enemy target',
  'errcode.cruiseNeedsTarget':      'Cruise missile needs an enemy plane target',
  'errcode.cannotPlayMissileDirect':'This missile cannot be played directly',
  'errcode.cardNotFound':           'Card not found',
  'errcode.targetNoRadars':         'Target has no radars',
  'errcode.targetNotOnBoard':       'Target plane is not on the board',
  'errcode.cruiseTargetInvalid':    'Cruise can only target takeoff or landing-strip planes',
  // Network / room codes
  'errcode.BAD_PAYLOAD':            'Invalid request payload',
  'errcode.NO_SESSION':             'Session expired — please sign in again',
  'errcode.NO_PLAYER':              'Player not found',
  'errcode.NO_ROOM':                'Room not found',
  'errcode.CANT_START':             'Cannot start the game right now',
  'errcode.CANT_RESTART':           'Cannot restart the game right now',
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

/**
 * Render a log line. Server-emitted lines are encoded as `i18n:<json>` where
 * <json> = {"k":"<key>","p":{...}}. Color-bearing fields in `p` are looked up
 * via `color.<value>` first so `red` becomes "红方" / "Red" in the active
 * locale. Unrecognised lines (legacy / debug strings) pass through verbatim.
 */
const COLOR_PARAM_FIELDS = ['color', 'enemy', 'attacker', 'defender', 'target'];
/** Maps a log line's translation key to the i18n namespace its `kind` param
 *  should be looked up in. Keeps server payload code-only and the user-visible
 *  string fully localized. */
const KIND_NAMESPACE_BY_KEY: Record<string, string> = {
  'log.drewMissile':    'missile.kind',
  'log.drewReward':     'reward',
  'log.drewPunishment': 'punishment',
};
export function renderLogLine(locale: Locale, line: string): string {
  if (!line.startsWith('i18n:')) return line;
  try {
    const obj = JSON.parse(line.slice(5)) as { k: string; p?: Record<string, string | number> };
    const params: Record<string, string | number> = { ...(obj.p || {}) };
    for (const f of COLOR_PARAM_FIELDS) {
      const v = params[f];
      if (typeof v === 'string') {
        const colorKey = `color.${v}`;
        const localized = DICTS[locale][colorKey] ?? DICTS.en[colorKey];
        if (localized) params[f] = localized;
      }
    }
    // Localize the `kind` param for log lines that quote a card kind code.
    const kindNs = KIND_NAMESPACE_BY_KEY[obj.k];
    if (kindNs && typeof params.kind === 'string') {
      const kindKey = `${kindNs}.${params.kind}`;
      const localized = DICTS[locale][kindKey] ?? DICTS.en[kindKey];
      if (localized) params.kind = localized;
    }
    // Engine error log line: server emits `{ msg: '<errcode>' }`. Map the
    // code to a localized string so `引擎错误：现在不是你的回合` renders
    // instead of the bare camelCase code.
    if (obj.k === 'log.engineError' && typeof params.msg === 'string') {
      const codeKey = `errcode.${params.msg}`;
      const localized = DICTS[locale][codeKey] ?? DICTS.en[codeKey];
      if (localized) params.msg = localized;
    }
    return translate(locale, obj.k, params);
  } catch {
    return line;
  }
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
