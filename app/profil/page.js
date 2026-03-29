'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toDisplay, toKg, unitLabel } from '@/utils/units'
import { formatCost, formatTokens } from '@/utils/pricing'

// Page Profil — formulaire onboarding / édition du profil utilisateur
export default function ProfilPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState(null)

  // Consommation API
  const [usageMonth, setUsageMonth] = useState(null)
  const [usageAll, setUsageAll] = useState(null)

  // Export données
  const [exportPeriod, setExportPeriod] = useState('all')
  const [exportDateFrom, setExportDateFrom] = useState('')
  const [exportDateTo, setExportDateTo] = useState('')
  const [exporting, setExporting] = useState(false)

  // Champs du formulaire
  const [age, setAge] = useState('')
  const [sexe, setSexe] = useState('')
  const [poids, setPoids] = useState('')
  const [taille, setTaille] = useState('')
  const [objectif, setObjectif] = useState('')
  const [niveau, setNiveau] = useState('')
  const [contextes, setContextes] = useState([])
  const [unite, setUnite] = useState('kg')

  useEffect(() => {
    async function loadProfile() {
      // Vérifier l'auth
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      setUserId(session.user.id)

      // Charger le profil existant
      const { data, error } = await supabase
        .from('profils')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (data) {
        setAge(data.age || '')
        setSexe(data.sexe || '')
        setTaille(data.taille_cm || '')
        setObjectif(data.objectif || '')
        setNiveau(data.niveau || '')
        setContextes(data.contextes_dispo || [])
        setUnite(data.unite_poids || 'kg')
        // Afficher le poids converti si unité lbs
        if (data.poids_kg) {
          setPoids(toDisplay(data.poids_kg, data.unite_poids || 'kg'))
        }
      }

      // Charger la consommation API
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data: monthData } = await supabase
        .from('api_usage')
        .select('*')
        .eq('user_id', session.user.id)
        .gte('created_at', startOfMonth.toISOString())
        .order('created_at', { ascending: false })

      setUsageMonth(monthData || [])

      const { data: allData } = await supabase
        .from('api_usage')
        .select('cost_usd, input_tokens, output_tokens, model_short')
        .eq('user_id', session.user.id)

      setUsageAll(allData || [])

      setLoading(false)
    }
    loadProfile()
  }, [router])

  // Toggle checkbox contexte
  function toggleContexte(val) {
    setContextes((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    )
  }

  // Sauvegarde du profil (UPSERT)
  async function handleSave(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)

    // Convertir le poids en kg avant sauvegarde
    const poidsKg = poids ? toKg(parseFloat(poids), unite) : null

    const { error } = await supabase
      .from('profils')
      .upsert({
        user_id: userId,
        age: age ? parseInt(age) : null,
        sexe: sexe || null,
        poids_kg: poidsKg,
        taille_cm: taille ? parseInt(taille) : null,
        objectif: objectif || null,
        niveau: niveau || null,
        contextes_dispo: contextes,
        unite_poids: unite,
      }, { onConflict: 'user_id' })

    setSaving(false)

    if (error) {
      setError(error.message)
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p style={{ color: '#777' }}>Chargement...</p>
      </div>
    )
  }

  // Style commun pour les inputs
  const inputStyle = {
    background: 'rgba(255,255,255,0.07)',
    color: '#f0f0f0',
    border: '1px solid rgba(255,255,255,0.08)',
  }

  return (
    <div className="min-h-screen px-4 pt-8 pb-8">
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#f0f0f0' }}>👤 Profil</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-sm">
        {/* Âge */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Âge</label>
          <input
            type="number"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="Ex: 35"
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Sexe */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Sexe</label>
          <select
            value={sexe}
            onChange={(e) => setSexe(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="homme">Homme</option>
            <option value="femme">Femme</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        {/* Unité de poids — toggle */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Unité de poids</label>
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => {
                // Convertir la valeur affichée si on change d'unité
                if (unite === 'lbs' && poids) {
                  setPoids(toKg(parseFloat(poids), 'lbs'))
                }
                setUnite('kg')
              }}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{
                background: unite === 'kg' ? '#f97316' : 'rgba(255,255,255,0.04)',
                color: unite === 'kg' ? '#fff' : '#777',
              }}
            >
              kg
            </button>
            <button
              type="button"
              onClick={() => {
                // Convertir la valeur affichée si on change d'unité
                if (unite === 'kg' && poids) {
                  setPoids(toDisplay(parseFloat(poids), 'lbs'))
                }
                setUnite('lbs')
              }}
              className="flex-1 py-2 text-sm font-semibold transition-colors"
              style={{
                background: unite === 'lbs' ? '#f97316' : 'rgba(255,255,255,0.04)',
                color: unite === 'lbs' ? '#fff' : '#777',
              }}
            >
              lbs
            </button>
          </div>
        </div>

        {/* Poids */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Poids ({unitLabel(unite)})</label>
          <input
            type="number"
            step="0.1"
            value={poids}
            onChange={(e) => setPoids(e.target.value)}
            placeholder={unite === 'kg' ? 'Ex: 80' : 'Ex: 176'}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Taille */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Taille (cm)</label>
          <input
            type="number"
            value={taille}
            onChange={(e) => setTaille(e.target.value)}
            placeholder="Ex: 180"
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          />
        </div>

        {/* Objectif */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Objectif</label>
          <select
            value={objectif}
            onChange={(e) => setObjectif(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="equilibre">Équilibre</option>
            <option value="force">Force</option>
            <option value="cardio">Cardio</option>
            <option value="perte_poids">Perte de poids</option>
            <option value="prise_masse">Prise de masse</option>
          </select>
        </div>

        {/* Niveau */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#777' }}>Niveau</label>
          <select
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#f97316]"
            style={inputStyle}
          >
            <option value="">— Choisir —</option>
            <option value="debutant">Débutant</option>
            <option value="intermediaire">Intermédiaire</option>
            <option value="confirme">Confirmé</option>
          </select>
        </div>

        {/* Contextes disponibles */}
        <div>
          <label className="text-xs mb-2 block" style={{ color: '#777' }}>Contextes disponibles</label>
          <div className="flex gap-3">
            {['Maison', 'Salle', 'Extérieur'].map((ctx) => (
              <label key={ctx} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: '#f0f0f0' }}>
                <input
                  type="checkbox"
                  checked={contextes.includes(ctx.toLowerCase())}
                  onChange={() => toggleContexte(ctx.toLowerCase())}
                  className="accent-[#f97316]"
                />
                {ctx}
              </label>
            ))}
          </div>
        </div>

        {/* Message d'erreur */}
        {error && (
          <p className="text-sm text-center" style={{ color: '#ef4444' }}>{error}</p>
        )}

        {/* Message de succès */}
        {success && (
          <p className="text-sm text-center" style={{ color: '#22c55e' }}>Profil enregistré !</p>
        )}

        {/* Bouton sauvegarder */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: '#f97316', color: '#fff' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </form>

      {/* ═══ EXPORT DONNÉES ═══ */}
      <ExportSection
        userId={userId}
        exportPeriod={exportPeriod}
        setExportPeriod={setExportPeriod}
        exportDateFrom={exportDateFrom}
        setExportDateFrom={setExportDateFrom}
        exportDateTo={exportDateTo}
        setExportDateTo={setExportDateTo}
        exporting={exporting}
        setExporting={setExporting}
        userUnite={unite}
      />

      {/* ═══ CONSOMMATION API ═══ */}
      {usageMonth && (
        <UsageSection usageMonth={usageMonth} usageAll={usageAll} />
      )}

      {/* Bouton déconnexion */}
      <button
        onClick={async () => {
          await supabase.auth.signOut()
          router.push('/login')
        }}
        className="w-full max-w-sm mt-8 rounded-lg py-3 text-sm font-semibold transition-colors"
        style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        Déconnexion
      </button>
    </div>
  )
}

// ═══ Composant consommation API ═══

// ═══ Composant Export Données ═══

const EXPORT_PERIODS = [
  { value: 'month', label: 'Mois en cours' },
  { value: '3months', label: '3 mois' },
  { value: '6months', label: '6 mois' },
  { value: 'year', label: '1 an' },
  { value: 'all', label: 'Tout' },
  { value: 'custom', label: 'Période libre' },
]

function getExportDateRange(period, dateFrom, dateTo) {
  const now = new Date()
  let from = null
  if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === '3months') {
    from = new Date(now)
    from.setMonth(from.getMonth() - 3)
  } else if (period === '6months') {
    from = new Date(now)
    from.setMonth(from.getMonth() - 6)
  } else if (period === 'year') {
    from = new Date(now)
    from.setFullYear(from.getFullYear() - 1)
  } else if (period === 'custom' && dateFrom) {
    from = new Date(dateFrom)
  }
  const to = period === 'custom' && dateTo ? new Date(dateTo + 'T23:59:59') : null
  return { from: from?.toISOString() || null, to: to?.toISOString() || null }
}

async function fetchExportData(userId, period, dateFrom, dateTo) {
  const { from, to } = getExportDateRange(period, dateFrom, dateTo)

  let query = supabase
    .from('seances')
    .select('*, series(*, exercices(nom, categorie, groupe_musculaire, type)), cardio_blocs(*)')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  if (from) query = query.gte('date', from.split('T')[0])
  if (to) query = query.lte('date', to.split('T')[0])

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

function generateCSV(seances) {
  const headers = [
    'date', 'heure_debut', 'contexte', 'duree_min', 'calories', 'rpe', 'notes',
    'type', 'exercice', 'categorie', 'groupe_musculaire', 'type_exercice',
    'num_serie', 'repetitions', 'poids_kg',
    'type_cardio', 'duree_cardio_min', 'distance_km', 'calories_cardio', 'fc', 'rpe_cardio',
  ]

  const rows = [headers.join(',')]

  for (const s of seances) {
    const base = [
      s.date, s.heure_debut || '', s.contexte || '', s.duree_totale || '', s.calories_totales || '', s.rpe || '',
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ]

    // Séries groupées par exercice
    const series = (s.series || []).sort((a, b) => (a.ordre || 0) - (b.ordre || 0) || a.num_serie - b.num_serie)
    for (const ser of series) {
      rows.push([
        ...base, 'exercice',
        `"${ser.exercices?.nom || ''}"`, ser.exercices?.categorie || '', ser.exercices?.groupe_musculaire || '', ser.exercices?.type || '',
        ser.num_serie, ser.repetitions, ser.poids_kg ?? '',
        '', '', '', '', '', '',
      ].join(','))
    }

    // Cardio
    for (const c of (s.cardio_blocs || []).sort((a, b) => (a.ordre || 0) - (b.ordre || 0))) {
      rows.push([
        ...base, 'cardio',
        '', '', '', '',
        '', '', '',
        c.type_cardio || '', c.duree_minutes || '', c.distance_km ?? '', c.calories ?? '', c.frequence_cardiaque ?? '', c.rpe ?? '',
      ].join(','))
    }

    // Séance sans exercices ni cardio → 1 ligne quand même
    if (series.length === 0 && (s.cardio_blocs || []).length === 0) {
      rows.push([...base, '', '', '', '', '', '', '', '', '', '', '', '', '', ''].join(','))
    }
  }

  return rows.join('\n')
}

function generateJSON(seances) {
  const clean = seances.map(s => ({
    date: s.date,
    heure_debut: s.heure_debut,
    contexte: s.contexte,
    duree_totale: s.duree_totale,
    calories_totales: s.calories_totales,
    rpe: s.rpe,
    notes: s.notes,
    coaching_before: s.coaching_before,
    coaching_during: s.coaching_during,
    coaching_after: s.coaching_after,
    exercices: Object.values(
      (s.series || []).reduce((acc, ser) => {
        const id = ser.exercice_id
        if (!acc[id]) acc[id] = {
          nom: ser.exercices?.nom, categorie: ser.exercices?.categorie,
          groupe_musculaire: ser.exercices?.groupe_musculaire, type: ser.exercices?.type,
          series: [],
        }
        acc[id].series.push({ num_serie: ser.num_serie, repetitions: ser.repetitions, poids_kg: ser.poids_kg })
        return acc
      }, {})
    ),
    cardio: (s.cardio_blocs || []).map(c => ({
      type: c.type_cardio, duree_minutes: c.duree_minutes,
      distance_km: c.distance_km, calories: c.calories,
      frequence_cardiaque: c.frequence_cardiaque, rpe: c.rpe,
    })),
  }))
  return JSON.stringify(clean, null, 2)
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ExportSection({ userId, exportPeriod, setExportPeriod, exportDateFrom, setExportDateFrom, exportDateTo, setExportDateTo, exporting, setExporting }) {
  const [exportToast, setExportToast] = useState(null)

  async function handleExport(format) {
    if (!userId) return
    setExporting(true)
    try {
      const seances = await fetchExportData(userId, exportPeriod, exportDateFrom, exportDateTo)
      if (seances.length === 0) {
        setExportToast('Aucune séance sur cette période')
        setTimeout(() => setExportToast(null), 3000)
        setExporting(false)
        return
      }

      const dateStr = new Date().toISOString().split('T')[0]
      if (format === 'csv') {
        const csv = generateCSV(seances)
        downloadFile(csv, `forge-export-${dateStr}.csv`, 'text/csv;charset=utf-8')
      } else {
        const json = generateJSON(seances)
        downloadFile(json, `forge-export-${dateStr}.json`, 'application/json')
      }
      setExportToast(`${seances.length} séance${seances.length > 1 ? 's' : ''} exportée${seances.length > 1 ? 's' : ''} ✅`)
      setTimeout(() => setExportToast(null), 3000)
    } catch (err) {
      console.error('❌ Erreur export :', err)
      setExportToast('Erreur lors de l\'export')
      setTimeout(() => setExportToast(null), 3000)
    }
    setExporting(false)
  }

  return (
    <div className="max-w-sm mt-8">
      <h2 className="text-lg font-bold mb-3" style={{ color: '#f0f0f0' }}>📥 Export données</h2>

      {/* Sélecteur période */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {EXPORT_PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setExportPeriod(p.value)}
            className="px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: exportPeriod === p.value ? '#f97316' : 'rgba(255,255,255,0.07)',
              color: exportPeriod === p.value ? '#fff' : '#777',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Période libre — date pickers */}
      {exportPeriod === 'custom' && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-[10px] block mb-1" style={{ color: '#555' }}>Du</label>
            <input
              type="date"
              value={exportDateFrom}
              onChange={e => setExportDateFrom(e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10px] block mb-1" style={{ color: '#555' }}>Au</label>
            <input
              type="date"
              value={exportDateTo}
              onChange={e => setExportDateTo(e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#f0f0f0', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
        </div>
      )}

      {/* Boutons export */}
      <div className="flex gap-2">
        <button
          onClick={() => handleExport('csv')}
          disabled={exporting || (exportPeriod === 'custom' && !exportDateFrom)}
          className="flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          {exporting ? '...' : '📊 CSV'}
        </button>
        <button
          onClick={() => handleExport('json')}
          disabled={exporting || (exportPeriod === 'custom' && !exportDateFrom)}
          className="flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
          style={{ background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          {exporting ? '...' : '📋 JSON'}
        </button>
      </div>

      <p className="text-[10px] mt-2 italic" style={{ color: '#444' }}>
        CSV : 1 ligne par série — ouvrable dans Excel / Google Sheets. JSON : structure hiérarchique avec coaching.
      </p>

      {exportToast && (
        <p className="text-xs text-center mt-2 font-medium" style={{ color: '#22c55e' }}>{exportToast}</p>
      )}
    </div>
  )
}

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

function calcUsageStats(usageData) {
  const byModel = {
    haiku: { calls: 0, tokens: 0, cost: 0 },
    sonnet: { calls: 0, tokens: 0, cost: 0 },
  }

  for (const u of usageData) {
    const model = u.model_short || 'sonnet'
    if (!byModel[model]) byModel[model] = { calls: 0, tokens: 0, cost: 0 }
    byModel[model].calls++
    byModel[model].tokens += (u.input_tokens || 0) + (u.output_tokens || 0)
    byModel[model].cost += parseFloat(u.cost_usd || 0)
  }

  const total = {
    calls: byModel.haiku.calls + byModel.sonnet.calls,
    tokens: byModel.haiku.tokens + byModel.sonnet.tokens,
    cost: byModel.haiku.cost + byModel.sonnet.cost,
  }

  return { byModel, total }
}

function calcWeeklyUsage(usageData) {
  const weeks = {}
  for (const u of usageData) {
    const date = new Date(u.created_at)
    const weekNum = getISOWeek(date)
    const key = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
    if (!weeks[key]) weeks[key] = { calls: 0, cost: 0, label: `Sem. ${weekNum}` }
    weeks[key].calls++
    weeks[key].cost += parseFloat(u.cost_usd || 0)
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v)
    .slice(0, 8)
}

function UsageSection({ usageMonth, usageAll }) {
  const monthStats = calcUsageStats(usageMonth)
  const allStats = calcUsageStats(usageAll || [])
  const weeklyUsage = calcWeeklyUsage(usageMonth)

  const monthName = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' })

  // Si aucune donnée, afficher un message court
  if (allStats.total.calls === 0) {
    return (
      <div className="max-w-sm mt-8">
        <h2 className="text-lg font-bold mb-3" style={{ color: '#f0f0f0' }}>📊 Consommation API</h2>
        <p className="text-xs" style={{ color: '#555' }}>Aucun appel IA enregistré pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="max-w-sm mt-8">
      <h2 className="text-lg font-bold mb-3" style={{ color: '#f0f0f0' }}>📊 Consommation API</h2>

      <p className="text-xs mb-2" style={{ color: '#777' }}>
        {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
      </p>

      {/* Cards Haiku / Sonnet côte à côte */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Haiku */}
        <div
          className="rounded-[10px] p-3"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)' }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: '#eab308' }}>🟡 Haiku</p>
          <p className="text-lg font-bold" style={{ color: '#f0f0f0' }}>{monthStats.byModel.haiku.calls}</p>
          <p className="text-[10px]" style={{ color: '#777' }}>appels</p>
          <p className="text-xs mt-1" style={{ color: '#999' }}>{formatTokens(monthStats.byModel.haiku.tokens)} tokens</p>
          <p className="text-xs" style={{ color: '#eab308' }}>{formatCost(monthStats.byModel.haiku.cost)}</p>
        </div>

        {/* Sonnet */}
        <div
          className="rounded-[10px] p-3"
          style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: '#a855f7' }}>🟣 Sonnet</p>
          <p className="text-lg font-bold" style={{ color: '#f0f0f0' }}>{monthStats.byModel.sonnet.calls}</p>
          <p className="text-[10px]" style={{ color: '#777' }}>appels</p>
          <p className="text-xs mt-1" style={{ color: '#999' }}>{formatTokens(monthStats.byModel.sonnet.tokens)} tokens</p>
          <p className="text-xs" style={{ color: '#a855f7' }}>{formatCost(monthStats.byModel.sonnet.cost)}</p>
        </div>
      </div>

      {/* Totaux */}
      <div
        className="rounded-[10px] px-3 py-2.5 mb-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs" style={{ color: '#777' }}>Total mois</span>
          <span className="text-base font-bold" style={{ color: '#f97316' }}>{formatCost(monthStats.total.cost)}</span>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-xs" style={{ color: '#555' }}>Total tout temps</span>
          <span className="text-xs font-medium" style={{ color: '#777' }}>{formatCost(allStats.total.cost)} · {allStats.total.calls} appels</span>
        </div>
      </div>

      {/* Détail par semaine */}
      {weeklyUsage.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-medium mb-1.5" style={{ color: '#777' }}>📈 Détail par semaine</p>
          {weeklyUsage.map((week, i) => (
            <div key={i} className="flex items-center justify-between py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span className="text-xs" style={{ color: '#999' }}>{week.label}</span>
              <span className="text-xs" style={{ color: '#777' }}>{week.calls} appels · {formatCost(week.cost)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] italic" style={{ color: '#444' }}>
        ⚠️ Coûts estimés sur la base de tarifs approximatifs. Consultez console.anthropic.com pour les coûts réels.
      </p>
    </div>
  )
}
