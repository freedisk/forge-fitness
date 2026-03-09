'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toDisplay, unitLabel } from '@/utils/units'
import {
  BarChart, Bar,
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'

// Périodes disponibles
const PERIODES = [
  { label: '7j', days: 7 },
  { label: '30j', days: 30 },
  { label: '90j', days: 90 },
  { label: 'Tout', days: null },
]

// Couleurs par groupe musculaire
const GROUPE_COLORS = {
  pecs: '#f97316',
  dos: '#3b82f6',
  epaules: '#eab308',
  biceps: '#22c55e',
  triceps: '#14b8a6',
  jambes: '#a855f7',
  abdos: '#ef4444',
  full_body: '#ec4899',
  autres: '#6b7280',
}

// Labels lisibles pour groupes musculaires
const GROUPE_LABELS = {
  pecs: 'Pecs',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  jambes: 'Jambes',
  abdos: 'Abdos',
  full_body: 'Full body',
  autres: 'Autres',
}

// Style tooltip Recharts (dark mode)
const tooltipStyle = {
  background: '#1a1a1a',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#f0f0f0',
  fontSize: 12,
}

// Trouver le lundi de la semaine ISO
function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return monday.toISOString().split('T')[0]
}

// Formater durée en heures + minutes
function formatDuree(minutes) {
  if (!minutes || minutes <= 0) return '0 min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

// Skeleton loading block
function Skeleton({ height = 200 }) {
  return (
    <div
      style={{
        height,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 12,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

export default function StatsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [periode, setPeriode] = useState(30)
  const [selectedExercice, setSelectedExercice] = useState(null)

  // Données brutes
  const [profil, setProfil] = useState(null)
  const [seances, setSeances] = useState([])
  const [series, setSeries] = useState([])
  const [cardioBlocs, setCardioBlocs] = useState([])

  // Chargement initial
  useEffect(() => {
    async function loadData() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          router.push('/login')
          return
        }

        const userId = session.user.id

        // Charger en parallèle : profil + séances
        const [profilRes, seancesRes] = await Promise.all([
          supabase
            .from('profils')
            .select('unite_poids')
            .eq('user_id', userId)
            .single(),
          supabase
            .from('seances')
            .select('id, date, duree_totale, calories_totales, contexte, rpe')
            .eq('user_id', userId)
            .order('date', { ascending: true }),
        ])

        if (profilRes.error) console.warn('Profil non trouvé:', profilRes.error)
        setProfil(profilRes.data)

        const seancesData = seancesRes.data || []
        setSeances(seancesData)

        // Charger séries + cardio si des séances existent
        if (seancesData.length > 0) {
          const seanceIds = seancesData.map(s => s.id)

          const [seriesRes, cardioRes] = await Promise.all([
            supabase
              .from('series')
              .select('seance_id, exercice_id, num_serie, repetitions, poids_kg, exercices(nom, groupe_musculaire, categorie)')
              .in('seance_id', seanceIds),
            supabase
              .from('cardio_blocs')
              .select('seance_id, duree_minutes, calories')
              .in('seance_id', seanceIds),
          ])

          setSeries(seriesRes.data || [])
          setCardioBlocs(cardioRes.data || [])
        }
      } catch (err) {
        console.error('Erreur chargement stats:', err)
        setError('Impossible de charger les statistiques')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  // Filtrer par période
  const filteredSeances = useMemo(() => {
    if (!periode) return seances
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - periode)
    const cutoffStr = cutoff.toISOString().split('T')[0]
    return seances.filter(s => s.date >= cutoffStr)
  }, [seances, periode])

  const filteredSeanceIds = useMemo(
    () => new Set(filteredSeances.map(s => s.id)),
    [filteredSeances]
  )

  const filteredSeries = useMemo(
    () => series.filter(s => filteredSeanceIds.has(s.seance_id)),
    [series, filteredSeanceIds]
  )

  // ═══ SECTION 1 : Résumé période ═══
  const resume = useMemo(() => {
    const nbSeances = filteredSeances.length
    const dureeTotale = filteredSeances.reduce((sum, s) => sum + (s.duree_totale || 0), 0)
    const caloriesTotales = filteredSeances.reduce((sum, s) => sum + (s.calories_totales || 0), 0)
    const nbSeries = filteredSeries.length
    return { nbSeances, dureeTotale, caloriesTotales, nbSeries }
  }, [filteredSeances, filteredSeries])

  // ═══ SECTION 2 : Volume par semaine ═══
  const volumeData = useMemo(() => {
    const volumeByWeek = {}
    for (const s of filteredSeries) {
      const seance = seances.find(se => se.id === s.seance_id)
      if (!seance) continue
      const week = getWeekKey(seance.date)
      volumeByWeek[week] = (volumeByWeek[week] || 0) + 1
    }
    return Object.entries(volumeByWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({
        semaine: new Date(week + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        series: count,
      }))
  }, [filteredSeries, seances])

  // ═══ SECTION 3 : Répartition musculaire ═══
  const pieData = useMemo(() => {
    const repartition = {}
    for (const s of filteredSeries) {
      const groupe = s.exercices?.groupe_musculaire || 'autres'
      repartition[groupe] = (repartition[groupe] || 0) + 1
    }
    return Object.entries(repartition)
      .map(([groupe, count]) => ({
        name: GROUPE_LABELS[groupe] || groupe,
        value: count,
        fill: GROUPE_COLORS[groupe] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredSeries])

  // ═══ SECTION 4 : Progression exercice ═══
  const exercicesAvecSeries = useMemo(() => {
    return [...new Map(
      filteredSeries
        .filter(s => s.exercices)
        .map(s => [s.exercice_id, s.exercices.nom])
    ).entries()].map(([id, nom]) => ({ id, nom }))
      .sort((a, b) => a.nom.localeCompare(b.nom))
  }, [filteredSeries])

  // Reset sélection si l'exercice n'est plus dans la période
  useEffect(() => {
    if (selectedExercice && !exercicesAvecSeries.find(e => e.id === selectedExercice)) {
      setSelectedExercice(null)
    }
  }, [exercicesAvecSeries, selectedExercice])

  const progressionData = useMemo(() => {
    if (!selectedExercice) return []
    const byDate = {}
    for (const s of filteredSeries) {
      if (s.exercice_id !== selectedExercice) continue
      const seance = seances.find(se => se.id === s.seance_id)
      if (!seance) continue
      const date = seance.date

      if (s.poids_kg != null) {
        byDate[date] = Math.max(byDate[date] || 0, s.poids_kg)
      } else {
        byDate[date] = Math.max(byDate[date] || 0, s.repetitions || 0)
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date: new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        valeur: value,
      }))
  }, [filteredSeries, seances, selectedExercice])

  // Déterminer si l'exercice sélectionné utilise du poids
  const selectedIsPoids = useMemo(() => {
    if (!selectedExercice) return false
    return filteredSeries.some(s => s.exercice_id === selectedExercice && s.poids_kg != null)
  }, [filteredSeries, selectedExercice])

  const unite = profil?.unite_poids || 'kg'

  // ═══ SECTION 5 : Records personnels all-time ═══
  const prList = useMemo(() => {
    const prByExo = {}
    for (const s of series) {
      if (!s.exercices) continue
      const key = s.exercice_id
      const nom = s.exercices.nom
      const groupe = s.exercices.groupe_musculaire

      if (!prByExo[key]) {
        prByExo[key] = { nom, groupe, poids_kg: null, reps: null }
      }

      if (s.poids_kg != null && (prByExo[key].poids_kg === null || s.poids_kg > prByExo[key].poids_kg)) {
        prByExo[key].poids_kg = s.poids_kg
      }
      if (s.repetitions != null && (prByExo[key].reps === null || s.repetitions > prByExo[key].reps)) {
        prByExo[key].reps = s.repetitions
      }
    }
    return Object.values(prByExo)
      .sort((a, b) => (b.poids_kg || 0) - (a.poids_kg || 0))
  }, [series])

  // Médailles PR
  const prMedals = ['🏆', '🥈', '🥉']

  // ═══ RENDER ═══

  if (loading) {
    return (
      <div className="min-h-screen px-5 pt-12 pb-24">
        <h1 className="text-2xl font-bold mb-6" style={{ color: '#f0f0f0' }}>📊 Statistiques</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Skeleton height={44} />
          <Skeleton height={60} />
          <Skeleton height={220} />
          <Skeleton height={240} />
          <Skeleton height={220} />
          <Skeleton height={200} />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen px-5 pt-12 pb-24">
        <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>📊 Statistiques</h1>
        <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
      </div>
    )
  }

  // État vide : aucune séance du tout
  if (seances.length === 0) {
    return (
      <div className="min-h-screen px-5 pt-12 pb-24">
        <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>📊 Statistiques</h1>
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#777', fontSize: 14, marginBottom: 12 }}>
            Aucune donnée disponible.
          </p>
          <a
            href="/seance"
            style={{
              color: '#f97316',
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Lance ta première séance !
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-5 pt-12 pb-24">
      {/* Titre */}
      <h1 className="text-2xl font-bold mb-4" style={{ color: '#f0f0f0' }}>📊 Statistiques</h1>

      {/* Filtre période */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {PERIODES.map(p => (
          <button
            key={p.label}
            onClick={() => setPeriode(p.days)}
            style={{
              padding: '8px 16px',
              borderRadius: 20,
              border: periode === p.days ? 'none' : '1px solid rgba(255,255,255,0.12)',
              background: periode === p.days ? '#f97316' : 'rgba(255,255,255,0.06)',
              color: periode === p.days ? '#fff' : '#999',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Résumé période */}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <p style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>RÉSUMÉ PÉRIODE</p>
        <p style={{ color: '#f0f0f0', fontSize: 14 }}>
          <span style={{ fontWeight: 700 }}>{resume.nbSeances}</span>
          <span style={{ color: '#777' }}> séance{resume.nbSeances > 1 ? 's' : ''}</span>
          <span style={{ color: '#555' }}> · </span>
          <span style={{ fontWeight: 700 }}>{formatDuree(resume.dureeTotale)}</span>
          {resume.caloriesTotales > 0 && (
            <>
              <span style={{ color: '#555' }}> · </span>
              <span style={{ fontWeight: 700 }}>{resume.caloriesTotales.toLocaleString('fr-FR')}</span>
              <span style={{ color: '#777' }}> kcal</span>
            </>
          )}
          <span style={{ color: '#555' }}> · </span>
          <span style={{ fontWeight: 700 }}>{resume.nbSeries}</span>
          <span style={{ color: '#777' }}> série{resume.nbSeries > 1 ? 's' : ''}</span>
        </p>
      </div>

      {/* Message vide pour la période sélectionnée */}
      {filteredSeances.length === 0 ? (
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#777', fontSize: 14 }}>
            Aucune donnée pour cette période. Essaie une période plus large !
          </p>
        </div>
      ) : (
        <>
          {/* ══ SECTION 2 : Volume par semaine ══ */}
          {volumeData.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ color: '#f0f0f0', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                📈 Volume par semaine
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={volumeData}>
                  <XAxis
                    dataKey="semaine"
                    tick={{ fill: '#777', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(249,115,22,0.1)' }}
                  />
                  <Bar
                    dataKey="series"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                    name="Séries"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══ SECTION 3 : Répartition musculaire ══ */}
          {pieData.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ color: '#f0f0f0', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                💪 Répartition musculaire
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value, name) => [`${value} séries`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Légende */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                {pieData.map(item => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.fill }} />
                    <span style={{ color: '#777' }}>{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ SECTION 4 : Progression exercice ══ */}
          {exercicesAvecSeries.length > 0 && (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ color: '#f0f0f0', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                📈 Progression exercice
              </p>
              <select
                value={selectedExercice || ''}
                onChange={e => setSelectedExercice(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  color: '#f0f0f0',
                  fontSize: 16,
                  marginBottom: 12,
                }}
              >
                <option value="">Choisis un exercice...</option>
                {exercicesAvecSeries.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.nom}</option>
                ))}
              </select>
              {selectedExercice && progressionData.length > 0 && (
                <>
                  <p style={{ color: '#777', fontSize: 11, marginBottom: 8, textAlign: 'right' }}>
                    {selectedIsPoids ? `Max ${unitLabel(unite)}` : 'Max reps'}
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={progressionData}>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#777', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#777', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={35}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value) => {
                          if (selectedIsPoids) {
                            return [`${toDisplay(value, unite)} ${unitLabel(unite)}`, 'Max']
                          }
                          return [`${value} reps`, 'Max']
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="valeur"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={{ fill: '#f97316', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
              {selectedExercice && progressionData.length === 0 && (
                <p style={{ color: '#777', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  Pas assez de données pour cet exercice
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ SECTION 5 : Records personnels (all-time, toujours affiché) ══ */}
      {prList.length > 0 && (
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <p style={{ color: '#f0f0f0', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
            🏆 Records personnels
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prList.map((pr, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, width: 22 }}>
                    {prMedals[i] || ''}
                  </span>
                  <div>
                    <p style={{ color: '#f0f0f0', fontSize: 13, fontWeight: 600 }}>{pr.nom}</p>
                    {pr.groupe && (
                      <span style={{
                        fontSize: 10,
                        color: GROUPE_COLORS[pr.groupe] || '#6b7280',
                        fontWeight: 500,
                      }}>
                        {GROUPE_LABELS[pr.groupe] || pr.groupe}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {pr.poids_kg != null ? (
                    <p style={{ color: '#f97316', fontSize: 14, fontWeight: 700 }}>
                      {toDisplay(pr.poids_kg, unite)} {unitLabel(unite)}
                    </p>
                  ) : pr.reps != null ? (
                    <p style={{ color: '#f97316', fontSize: 14, fontWeight: 700 }}>
                      {pr.reps} reps
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
