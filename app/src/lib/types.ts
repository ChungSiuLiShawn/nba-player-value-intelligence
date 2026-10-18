// Frontend shared types + English display mappings
export const TEAM_EN: Record<string, string> = {
  掘金: 'Nuggets', 湖人: 'Lakers', 马刺: 'Spurs', 雷霆: 'Thunder', 凯尔特人: 'Celtics',
  勇士: 'Warriors', 雄鹿: 'Bucks', '76人': '76ers', 太阳: 'Suns', 森林狼: 'Timberwolves',
  独行侠: 'Mavericks', 鹈鹕: 'Pelicans', 国王: 'Kings', 步行者: 'Pacers', 热火: 'Heat',
  灰熊: 'Grizzlies', 骑士: 'Cavaliers', 尼克斯: 'Knicks', 老鹰: 'Hawks', 魔术: 'Magic',
  活塞: 'Pistons', 猛龙: 'Raptors', 公牛: 'Bulls', 篮网: 'Nets', 黄蜂: 'Hornets',
  奇才: 'Wizards', 火箭: 'Rockets', 快船: 'Clippers', 爵士: 'Jazz', 开拓者: 'Trail Blazers',
}

export const CATEGORY_EN: Record<string, string> = {
  竞技爆发: 'Breakout', 角色提升: 'Role Up', 合同利好: 'Contract Win', 荣誉认可: 'Honors',
  商业增值: 'Brand Value', 伤病: 'Injury', 角色萎缩: 'Role Cut', 合同纠纷: 'Contract Dispute',
  状态下滑: 'Slump', 场外负面: 'Off-court',
}

export const POSITION_EN: Record<string, string> = {
  PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', C: 'Center',
}

export function teamEn(team: string): string {
  return TEAM_EN[team] ?? team
}

export function catEn(cat: string): string {
  return CATEGORY_EN[cat] ?? cat
}

// 前端共享类型（Phase C：与静态数据集解耦，页面/组件只依赖本文件）
export type NewsCategory =
  | '竞技爆发' | '角色提升' | '合同利好' | '荣誉认可' | '商业增值'
  | '伤病' | '角色萎缩' | '合同纠纷' | '状态下滑' | '场外负面'

export const BULLISH_CATS: NewsCategory[] = ['竞技爆发', '角色提升', '合同利好', '荣誉认可', '商业增值']
export const BEARISH_CATS: NewsCategory[] = ['伤病', '角色萎缩', '合同纠纷', '状态下滑', '场外负面']

export interface NewsItem {
  id: string
  date: string
  title: string
  source: string
  sourceTier: 1 | 2 | 3
  category: NewsCategory
  sentiment: number
  confirmed: boolean
}

export interface IndexPoint {
  date: string
  value: number
  event?: string
}

export interface Factor {
  name: string
  change: string
  direction: 'up' | 'down' | 'flat'
  contribution: number
}

export interface SeasonStats {
  gp: number
  min: number
  pts: number
  ast: number
  oreb: number
  dreb: number
  stl: number
  blk: number
  tov: number
  pf: number
  fgm: number
  fga: number
  p3m: number
  p3a: number
  ftm: number
  fta: number
  tsPct: number
  gmSc: number
}

export interface Player {
  id: string
  nameZh: string
  nameEn: string
  position: string
  positionZh: string
  team: string
  age: number
  overallRating: number
  valueIndex: number
  change7d: number
  change30d: number
  predictedIndex7d: number
  riseProbability: number
  netSentiment: number
  sentiment7d: number
  hasRecentNews: boolean
  scores: {
    performance: number
    role: number
    sentiment: number
    contract: number
    age: number
    commercial: number
    physical: number
  }
  physical: {
    heightIn: number
    weightLbs: number
    wingspanIn: number
    verticalIn: number
    strengthScore: number
  }
  espnId: string | null
  predictionReasons: string[]
  reportSummary: string
  reportFactors: Factor[]
  reportVerdict: string
  history: IndexPoint[]
  news: NewsItem[]
  avatarColor: string
  stats: SeasonStats
}

export type LeaderKey = 'pts' | 'ast' | 'reb' | 'stl'

export function leaderStatVal(p: Player, key: LeaderKey): number {
  return key === 'reb' ? +(p.stats.oreb + p.stats.dreb).toFixed(1) : p.stats[key]
}

export function statLeader(key: LeaderKey, pool: Player[]): Player {
  return [...pool].sort((a, b) => leaderStatVal(b, key) - leaderStatVal(a, key))[0]
}
