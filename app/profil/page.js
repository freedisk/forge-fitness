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
