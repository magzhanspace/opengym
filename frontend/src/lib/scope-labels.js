// The words for each token category and level (Settings → API tokens, the MCP consent screen).
// Keys are English source strings, like every t().
import { t } from './i18n.js'

export const categoryLabel = id => ({
  metrics: t('Key numbers'), workouts: t('Workouts'), plans: t('Plans & routines'), bodyweight: t('Body weight'),
  measurements: t('Body measurements'), photos: t('Progress photos'), notes: t('Notes'), nutrition: t('Nutrition'),
}[id] || id)
export const levelLabel = lv => ({ off: t('Off'), view: t('See'), suggest: t('Suggest'), apply: t('Change directly') }[lv] || lv)
