'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Fonctions de calcul KPI ──────────────────────────────────

// 🔥 Streak — jours consécutifs d'entraînement
function calcStreak(seances) {
  if (!seances || seances.length === 0) return 0

  const datesSet = new Set(seances.map(s => s.date))
  let streak = 0
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // Commencer par aujourd'hui, sinon hier
  const hasToday = datesSet.has(todayStr)
  const startDate = new Date(now)
  if (!hasToday) {
    startDate.setDate(startDate.getDate() - 1)
    // Si hier non plus → streak = 0
    const yesterdayStr = startDate.toISOString().split('T')[0]
    if (!datesSet.has(yesterdayStr)) return 0
  }

  for (let i = 0; i < 365; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    if (datesSet.has(dateStr)) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// ⚡ Calories brûlées cette semaine (lundi → aujourd'hui)
function calcCaloriesSemaine(seances) {
  if (!seances || seances.length === 0) return 0

  const today = new Date()
  const dayOfWeek = today.getDay() // 0=dim, 1=lun...
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - mondayOffset)
  const mondayStr = monday.toISOString().split('T')[0]

  return seances
    .filter(s => s.date >= mondayStr)
    .reduce((sum, s) => sum + (s.calories_totales || 0), 0)
}

// 🏆 Records PR ce mois — exercices où le max du mois = max all-time
function calcPRCount(seriesMonth, seriesAll) {
  if (!seriesMonth || !seriesAll || seriesMonth.length === 0) return 0

  const allMaxByExo = {}
  const monthMaxByExo = {}

  // Max all-time par exercice
  for (const s of seriesAll) {
    const key = s.exercice_id
    if (s.poids_kg != null) {
      allMaxByExo[key] = Math.max(allMaxByExo[key] || 0, s.poids_kg)
    } else {
      allMaxByExo[key] = Math.max(allMaxByExo[key] || 0, s.repetitions || 0)
    }
  }

  // Max du mois par exercice
  for (const s of seriesMonth) {
    const key = s.exercice_id
    if (s.poids_kg != null) {
      monthMaxByExo[key] = Math.max(monthMaxByExo[key] || 0, s.poids_kg)
    } else {
      monthMaxByExo[key] = Math.max(monthMaxByExo[key] || 0, s.repetitions || 0)
    }
  }

  // Compter les exercices où max mois >= max all-time (record battu ou égalé ce mois)
  let prCount = 0
  for (const exoId of Object.keys(monthMaxByExo)) {
    if (monthMaxByExo[exoId] >= (allMaxByExo[exoId] || 0) && monthMaxByExo[exoId] > 0) {
      prCount++
    }
  }
  return prCount
}

// 💪 Séances par semaine (moyenne des 4 dernières semaines)
function calcSeancesPerWeek(seances) {
  if (!seances || seances.length === 0) return '0.0'

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const fourWeeksStr = fourWeeksAgo.toISOString().split('T')[0]

  const count = seances.filter(s => s.date >= fourWeeksStr).length
  return (count / 4).toFixed(1)
}

// ── Heatmap 12 semaines ──────────────────────────────────────

function buildHeatmapData(seances) {
  // Construire un map date → présence (1) ou absence (0)
  const dateMap = {}
  if (seances) {
    for (const s of seances) {
      dateMap[s.date] = (dateMap[s.date] || 0) + 1
    }
  }

  // Générer 84 jours (12 semaines) depuis le lundi il y a 11 semaines
  const days = []
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=dim
  const offsetToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const startMonday = new Date(today)
  startMonday.setDate(today.getDate() - offsetToMonday - (11 * 7))

  for (let i = 0; i < 84; i++) {
    const d = new Date(startMonday)
    d.setDate(startMonday.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    // Comparer par date string pour éviter les problèmes de timezone
    const isFuture = dateStr > today.toISOString().split('T')[0]
    days.push({
      date: dateStr,
      level: isFuture ? -1 : (dateMap[dateStr] ? 1 : 0),
    })
  }
  return days
}

// ── Date relative en français ────────────────────────────────

function formatDateRelative(dateStr) {
  if (!dateStr) return ''
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  if (dateStr === todayStr) return "Aujourd'hui"
  if (dateStr === yesterdayStr) return 'Hier'

  // Calcul du nombre de jours
  const d = new Date(dateStr + 'T00:00:00')
  const diffMs = today.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 7) return `Il y a ${diffDays} jours`
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Il y a ${weeks} sem.`
  }
  // Format date courte
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ══════════════════════════════════════════════════════════════
// Dashboard Home — KPIs + Heatmap + CTA + Dernière séance
// ══════════════════════════════════════════════════════════════

export default function HomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profil, setProfil] = useState(null)
  const [seances, setSeances] = useState([])
  const [seriesMonth, setSeriesMonth] = useState([])
  const [seriesAll, setSeriesAll] = useState([])
  const [lastSeance, setLastSeance] = useState(null)

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Vérifier l'auth
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.push('/login')
          return
        }
        setUser(session.user)
        const userId = session.user.id

        // Dates de référence
        const ninetyDaysAgo = new Date()
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const ninetyDaysStr = ninetyDaysAgo.toISOString().split('T')[0]

        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        const monthStr = startOfMonth.toISOString().split('T')[0]

        // Charger tout en parallèle
        const [seancesRes, profilRes, lastSeanceRes, seriesAllRes, seancesMonthRes] = await Promise.all([
          // 1. Séances des 90 derniers jours
          supabase
            .from('seances')
            .select('id, date, duree_totale, calories_totales, contexte')
            .eq('user_id', userId)
            .gte('date', ninetyDaysStr)
            .order('date', { ascending: false }),

          // 2. Profil utilisateur
          supabase
            .from('profils')
            .select('*')
            .eq('user_id', userId)
            .single(),

          // 3. Dernière séance avec détails
          supabase
            .from('seances')
            .select('*, cardio_blocs(*), series(*, exercices(nom))')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle(),

          // 4. Toutes les séries historiques (pour PR all-time)
          supabase
            .from('series')
            .select('exercice_id, poids_kg, repetitions, seance_id'),

          // 5. Séances du mois en cours (pour récupérer leurs IDs et filtrer les séries)
          supabase
            .from('seances')
            .select('id')
            .eq('user_id', userId)
            .gte('date', monthStr),
        ])

        const seancesData = seancesRes.data || []
        setSeances(seancesData)
        setProfil(profilRes.data)
        setLastSeance(lastSeanceRes.data)

        // Filtrer les séries all-time : ne garder que celles de l'utilisateur
        // On fait une jointure côté JS avec les seance_ids connus de l'utilisateur
        const allUserSeanceIds = new Set()
        // Les séances 90 jours
        seancesData.forEach(s => allUserSeanceIds.add(s.id))
        // Les séances du mois
        if (seancesMonthRes.data) {
          seancesMonthRes.data.forEach(s => allUserSeanceIds.add(s.id))
        }
        // Pour les séances plus anciennes que 90 jours, on a besoin de TOUTES les séances user
        // Récupérons tous les IDs de séances de l'utilisateur
        const { data: allSeanceIds } = await supabase
          .from('seances')
          .select('id')
          .eq('user_id', userId)

        const allUserIds = new Set((allSeanceIds || []).map(s => s.id))

        // Filtrer séries all-time et séries du mois
        const allSeriesFiltered = (seriesAllRes.data || []).filter(s => allUserIds.has(s.seance_id))
        setSeriesAll(allSeriesFiltered)

        const monthSeanceIds = new Set((seancesMonthRes.data || []).map(s => s.id))
        const seriesMonthFiltered = allSeriesFiltered.filter(s => monthSeanceIds.has(s.seance_id))
        setSeriesMonth(seriesMonthFiltered)

      } catch (err) {
        console.error('Erreur chargement dashboard :', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [router])

  // ── Calculs KPIs ──

  const streak = calcStreak(seances)
  const caloriesWeek = calcCaloriesSemaine(seances)
  const prCount = calcPRCount(seriesMonth, seriesAll)
  const seancesPerWeek = calcSeancesPerWeek(seances)
  const heatmapDays = buildHeatmapData(seances)

  // ── Infos dernière séance ──

  const lastExoCount = lastSeance
    ? new Set((lastSeance.series || []).map(s => s.exercice_id)).size
    : 0

  // ── Skeleton loading ──

  if (loading) {
    return (
      <div className="min-h-screen px-5 pt-12 pb-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-28 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="h-4 w-24 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* KPI skeleton 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="mb-6">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="rounded-xl animate-pulse"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                height: 100,
                borderRadius: 10,
              }}
            />
          ))}
        </div>

        {/* Heatmap skeleton */}
        <div className="mb-6 animate-pulse" style={{ height: 120, borderRadius: 10, background: 'rgba(255,255,255,0.04)' }} />

        {/* CTA skeleton */}
        <div className="animate-pulse" style={{ height: 52, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
      </div>
    )
  }

  // ── État vide (aucune séance) ──

  const isEmpty = seances.length === 0

  if (isEmpty) {
    return (
      <div className="min-h-screen px-5 pt-12 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">
            <span style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ⚡ FORGE
            </span>
          </h1>
          <p className="text-sm" style={{ color: '#999' }}>
            Bonjour {profil?.prenom || user?.email?.split('@')[0] || ''}
          </p>
        </div>

        {/* Message vide */}
        <div
          className="rounded-xl px-6 py-10 text-center mb-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <p className="text-4xl mb-4">🔥</p>
          <p className="text-lg font-semibold mb-2">Bienvenue sur FORGE !</p>
          <p className="text-sm" style={{ color: '#999' }}>Lance ta première séance pour commencer à tracker tes progrès.</p>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push('/seance')}
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f97316, #dc2626)',
            color: 'white',
            fontWeight: 700,
            fontSize: 16,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ⚡ COMMENCER LA SÉANCE
        </button>
      </div>
    )
  }

  // ── Dashboard complet ──

  const kpis = [
    { emoji: '🔥', label: 'Streak', value: `${streak}`, unit: streak <= 1 ? 'jour' : 'jours', color: '#f97316' },
    { emoji: '⚡', label: 'Cal. sem.', value: caloriesWeek.toLocaleString('fr-FR'), unit: 'kcal', color: '#eab308' },
    { emoji: '🏆', label: 'PR mois', value: `${prCount}`, unit: prCount <= 1 ? 'record' : 'records', color: '#22c55e' },
    { emoji: '💪', label: 'Séances/sem', value: seancesPerWeek, unit: 'moy.', color: '#3b82f6' },
  ]

  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  return (
    <div className="min-h-screen px-5 pt-12 pb-8" style={{ maxWidth: 600, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          <span style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ⚡ FORGE
          </span>
        </h1>
        <p className="text-sm" style={{ color: '#999' }}>
          Bonjour {profil?.prenom || user?.email?.split('@')[0] || ''}
        </p>
      </div>

      {/* ── KPI Cards 2×2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="mb-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <span style={{ fontSize: 20 }}>{kpi.emoji}</span>
            <p
              className="mt-1"
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#777',
                fontWeight: 600,
              }}
            >
              {kpi.label}
            </p>
            <p className="mt-1" style={{ fontSize: 24, fontWeight: 700, color: kpi.color, lineHeight: 1.1 }}>
              {kpi.value}
            </p>
            <p style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{kpi.unit}</p>
          </div>
        ))}
      </div>

      {/* ── Heatmap 12 semaines ── */}
      <div className="mb-6">
        <p
          className="mb-3"
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#777',
            fontWeight: 600,
          }}
        >
          Activité 12 semaines
        </p>

        <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {/* Labels jours */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 4 }}>
              {dayLabels.map((d, i) => (
                <div
                  key={i}
                  style={{
                    width: 14,
                    height: 12,
                    fontSize: 9,
                    color: '#555',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Grille heatmap */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: 'repeat(7, 1fr)',
                gridAutoFlow: 'column',
                gap: 3,
              }}
            >
              {heatmapDays.map((day, i) => (
                <div
                  key={i}
                  title={day.date}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background:
                      day.level === -1
                        ? 'transparent'
                        : day.level === 0
                          ? 'rgba(255,255,255,0.05)'
                          : 'rgba(249,115,22,0.7)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Légende */}
        <div className="flex items-center justify-end gap-1.5 mt-2">
          <span style={{ fontSize: 9, color: '#555' }}>Moins</span>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(249,115,22,0.3)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(249,115,22,0.55)' }} />
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(249,115,22,0.8)' }} />
          <span style={{ fontSize: 9, color: '#555' }}>Plus</span>
        </div>
      </div>

      {/* ── CTA ── */}
      <button
        onClick={() => router.push('/seance')}
        className="mb-6"
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #f97316, #dc2626)',
          color: 'white',
          fontWeight: 700,
          fontSize: 16,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        ⚡ COMMENCER LA SÉANCE
      </button>

      {/* ── Dernière séance ── */}
      {lastSeance ? (
        <div
          className="rounded-xl"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: 16,
          }}
        >
          <p
            className="mb-3"
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#777',
              fontWeight: 600,
            }}
          >
            📋 Dernière séance
          </p>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            {/* Date relative */}
            <span className="text-sm font-medium" style={{ color: '#ccc' }}>
              {formatDateRelative(lastSeance.date)}
            </span>

            {/* Badge contexte */}
            {lastSeance.contexte && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: lastSeance.contexte === 'salle'
                    ? 'rgba(59,130,246,0.15)'
                    : 'rgba(249,115,22,0.15)',
                  color: lastSeance.contexte === 'salle' ? '#60a5fa' : '#fb923c',
                  border: `1px solid ${lastSeance.contexte === 'salle'
                    ? 'rgba(59,130,246,0.25)'
                    : 'rgba(249,115,22,0.25)'}`,
                }}
              >
                {lastSeance.contexte === 'salle' ? '🏋️ Salle' : '🏠 Maison'}
              </span>
            )}
          </div>

          {/* Stats compactes */}
          <div className="flex items-center gap-3 text-xs" style={{ color: '#999' }}>
            {lastSeance.duree_totale && (
              <span>⏱️ {lastSeance.duree_totale} min</span>
            )}
            {lastExoCount > 0 && (
              <span>🎯 {lastExoCount} exo{lastExoCount > 1 ? 's' : ''}</span>
            )}
            {lastSeance.calories_totales > 0 && (
              <span>🔥 {lastSeance.calories_totales} kcal</span>
            )}
          </div>

          {/* Lien détail */}
          <button
            onClick={() => router.push(`/historique/${lastSeance.id}`)}
            className="mt-3 text-xs"
            style={{
              color: '#f97316',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
          >
            Voir le détail →
          </button>
        </div>
      ) : (
        <div
          className="rounded-xl text-center py-6"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}
        >
          <p className="text-sm" style={{ color: '#777' }}>Aucune séance encore. Lance-toi ! 🔥</p>
        </div>
      )}
    </div>
  )
}
